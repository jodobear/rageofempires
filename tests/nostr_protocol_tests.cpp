#include "aoe/nostr_protocol.hpp"

#include <iostream>
#include <stdexcept>

namespace {

int failures{};

void expect(bool value, const char* message) {
    if (!value) {
        ++failures;
        std::cerr << "FAIL: " << message << '\n';
    }
}

aoe::NostrLogicalEvent event(
    std::uint64_t sequence,
    std::string previous,
    std::string id,
    std::string content = "turn"
) {
    return {sequence, std::move(previous), std::move(id), std::move(content)};
}

template<typename Callable>
void expect_rejected(Callable&& callable, const char* message) {
    try {
        callable();
        expect(false, message);
    } catch (const std::invalid_argument&) {
    }
}

}  // namespace

int main() {
    const aoe::MatchSettingsV1 defaults =
        aoe::default_match_settings_v1();
    const std::string canonical =
        aoe::canonical_match_settings_v1(defaults);
    expect(
        canonical ==
            "match-settings-v1 1 \"reconstruction-dev\" 1 3 68 131 71 "
            "\"reconstruction-rules-v1\" arabia normal 1 britons franks "
            "200 conquest",
        "MatchSettingsV1 canonical bytes are stable"
    );
    expect(
        aoe::decode_match_settings_v1(canonical) == defaults,
        "MatchSettingsV1 canonical bytes round trip"
    );
    expect(
        aoe::match_settings_v1_digest(defaults) ==
            "match-settings-v1-fnv1a64:0f1a2d85e420cd68",
        "MatchSettingsV1 digest has stable golden value"
    );
    expect(
        aoe::match_settings_v1_digest(
            aoe::decode_match_settings_v1(canonical)
        ) == aoe::match_settings_v1_digest(defaults),
        "decoded MatchSettingsV1 retains digest"
    );
    aoe::MatchSettingsV1 changed = defaults;
    changed.map_kind = aoe::RandomMapKind::rivers;
    expect(
        aoe::match_settings_v1_digest(changed) !=
            aoe::match_settings_v1_digest(defaults),
        "MatchSettingsV1 digest binds map choice"
    );
    changed = defaults;
    changed.red_civilization = aoe::Civilization::mayans;
    expect(
        aoe::match_settings_v1_digest(changed) !=
            aoe::match_settings_v1_digest(defaults),
        "MatchSettingsV1 digest binds civilizations"
    );
    expect_rejected([&] {
        auto invalid = defaults;
        invalid.version = 2;
        static_cast<void>(aoe::canonical_match_settings_v1(invalid));
    }, "unknown MatchSettingsV1 version rejected");
    expect_rejected([&] {
        auto invalid = defaults;
        ++invalid.nostr_protocol_version;
        static_cast<void>(aoe::canonical_match_settings_v1(invalid));
    }, "unknown Nostr protocol version rejected");
    expect_rejected([&] {
        auto invalid = defaults;
        ++invalid.lockstep_protocol_version;
        static_cast<void>(aoe::canonical_match_settings_v1(invalid));
    }, "unknown lockstep protocol version rejected");
    expect_rejected([&] {
        auto invalid = defaults;
        ++invalid.command_schema_version;
        static_cast<void>(aoe::canonical_match_settings_v1(invalid));
    }, "unknown command schema version rejected");
    expect_rejected([&] {
        auto invalid = defaults;
        ++invalid.save_version;
        static_cast<void>(aoe::canonical_match_settings_v1(invalid));
    }, "unknown save version rejected");
    expect_rejected([&] {
        auto invalid = defaults;
        ++invalid.scenario_version;
        static_cast<void>(aoe::canonical_match_settings_v1(invalid));
    }, "unknown scenario version rejected");
    expect_rejected([&] {
        auto invalid = defaults;
        invalid.map_size = aoe::RandomMapSize::giant;
        static_cast<void>(aoe::canonical_match_settings_v1(invalid));
    }, "unsupported MatchSettingsV1 map size rejected");
    expect_rejected([&] {
        auto invalid = defaults;
        invalid.blue_civilization = aoe::Civilization::generic;
        static_cast<void>(aoe::canonical_match_settings_v1(invalid));
    }, "generic MatchSettingsV1 civilization rejected");
    expect_rejected([&] {
        auto invalid = defaults;
        invalid.population_limit = 75;
        static_cast<void>(aoe::canonical_match_settings_v1(invalid));
    }, "unsupported MatchSettingsV1 population limit rejected");
    expect_rejected([&] {
        static_cast<void>(aoe::decode_match_settings_v1(canonical + " "));
    }, "MatchSettingsV1 trailing whitespace rejected");
    expect_rejected([&] {
        std::string unknown_map = canonical;
        unknown_map.replace(
            unknown_map.find("arabia"), 6, "nomad_"
        );
        static_cast<void>(aoe::decode_match_settings_v1(unknown_map));
    }, "unknown MatchSettingsV1 map rejected");
    expect_rejected([&] {
        std::string unknown_victory = canonical;
        unknown_victory.replace(
            unknown_victory.find("conquest"), 8, "wonder__"
        );
        static_cast<void>(aoe::decode_match_settings_v1(unknown_victory));
    }, "unknown MatchSettingsV1 victory mode rejected");
    expect_rejected([&] {
        std::string alternate = canonical;
        alternate.replace(
            alternate.find(" 1 britons"), 2, " 01"
        );
        static_cast<void>(aoe::decode_match_settings_v1(alternate));
    }, "MatchSettingsV1 alternate number encoding rejected");

    aoe::NostrSenderSequence reordered;
    expect(
        reordered.accept(event(2, "event-1", "event-2")) ==
            aoe::NostrSequenceAccept::buffered,
        "future sender event buffered"
    );
    expect(
        reordered.drain().contiguous.empty(),
        "future sender event waits for gap"
    );
    expect(
        reordered.missing_ranges() ==
            std::vector<std::pair<std::uint64_t, std::uint64_t>>{{1, 1}},
        "missing sequence range reported"
    );
    expect(
        reordered.accept(event(1, "", "event-1")) ==
            aoe::NostrSequenceAccept::buffered,
        "missing sender event accepted"
    );
    const aoe::NostrSequenceDrain contiguous = reordered.drain();
    expect(
        !contiguous.conflict && contiguous.contiguous.size() == 2 &&
            contiguous.contiguous[0].sequence == 1 &&
            contiguous.contiguous[1].sequence == 2 &&
            reordered.highest_contiguous_sequence() == 2 &&
            reordered.last_event_id() == "event-2",
        "reordered events drain through previous-event chain"
    );
    expect(
        reordered.accept(event(1, "", "event-1")) ==
            aoe::NostrSequenceAccept::duplicate,
        "exact accepted duplicate ignored"
    );

    aoe::NostrSenderSequence duplicate_conflict;
    expect(
        duplicate_conflict.accept(event(1, "", "event-a")) ==
            aoe::NostrSequenceAccept::buffered &&
        duplicate_conflict.accept(event(1, "", "event-b")) ==
            aoe::NostrSequenceAccept::conflict &&
        duplicate_conflict.conflicted(),
        "same sequence with different event conflicts"
    );

    aoe::NostrSenderSequence chain_conflict;
    expect(
        chain_conflict.accept(event(1, "wrong", "event-1")) ==
            aoe::NostrSequenceAccept::buffered,
        "chain candidate buffered"
    );
    const aoe::NostrSequenceDrain rejected_chain = chain_conflict.drain();
    expect(
        rejected_chain.conflict && chain_conflict.conflicted(),
        "incorrect previous-event link conflicts during drain"
    );

    aoe::NostrSenderSequence bounded;
    expect(
        bounded.accept(event(
            aoe::nostr_max_future_sender_sequences + 1,
            "", "too-far"
        )) == aoe::NostrSequenceAccept::out_of_bounds,
        "far-future sequence rejected by memory bound"
    );

    if (failures == 0) std::cout << "Nostr protocol tests passed\n";
    return failures == 0 ? 0 : 1;
}
