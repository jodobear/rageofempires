#include "aoe/nostr_protocol.hpp"

#include <algorithm>
#include <iomanip>
#include <sstream>
#include <stdexcept>

#include "aoe/format_versions.hpp"
#include "aoe/multiplayer.hpp"

namespace aoe {
namespace {

constexpr int match_settings_version = 1;
constexpr int match_settings_population_limit = 200;

std::string_view map_kind_name(RandomMapKind kind) {
    switch (kind) {
        case RandomMapKind::arabia: return "arabia";
        case RandomMapKind::black_forest: return "black_forest";
        case RandomMapKind::islands: return "islands";
        case RandomMapKind::rivers: return "rivers";
    }
    throw std::invalid_argument("invalid MatchSettingsV1 map kind");
}

RandomMapKind parse_map_kind(const std::string& value) {
    if (value == "arabia") return RandomMapKind::arabia;
    if (value == "black_forest") return RandomMapKind::black_forest;
    if (value == "islands") return RandomMapKind::islands;
    if (value == "rivers") return RandomMapKind::rivers;
    throw std::invalid_argument("invalid MatchSettingsV1 map kind");
}

std::string_view map_size_name(RandomMapSize size) {
    if (size == RandomMapSize::normal) return "normal";
    throw std::invalid_argument("unsupported MatchSettingsV1 map size");
}

RandomMapSize parse_map_size(const std::string& value) {
    if (value == "normal") return RandomMapSize::normal;
    throw std::invalid_argument("unsupported MatchSettingsV1 map size");
}

std::string_view civilization_name(Civilization civilization) {
    switch (civilization) {
        case Civilization::britons: return "britons";
        case Civilization::franks: return "franks";
        case Civilization::teutons: return "teutons";
        case Civilization::goths: return "goths";
        case Civilization::celts: return "celts";
        case Civilization::vikings: return "vikings";
        case Civilization::byzantines: return "byzantines";
        case Civilization::japanese: return "japanese";
        case Civilization::chinese: return "chinese";
        case Civilization::persians: return "persians";
        case Civilization::saracens: return "saracens";
        case Civilization::turks: return "turks";
        case Civilization::mongols: return "mongols";
        case Civilization::spanish: return "spanish";
        case Civilization::huns: return "huns";
        case Civilization::koreans: return "koreans";
        case Civilization::aztecs: return "aztecs";
        case Civilization::mayans: return "mayans";
        case Civilization::generic: break;
    }
    throw std::invalid_argument("invalid MatchSettingsV1 civilization");
}

Civilization parse_civilization(const std::string& value) {
    for (int raw = static_cast<int>(Civilization::britons);
         raw <= static_cast<int>(Civilization::mayans); ++raw) {
        const auto civilization = static_cast<Civilization>(raw);
        if (civilization_name(civilization) == value) return civilization;
    }
    throw std::invalid_argument("invalid MatchSettingsV1 civilization");
}

std::string_view victory_mode_name(MatchVictoryMode mode) {
    if (mode == MatchVictoryMode::conquest) return "conquest";
    throw std::invalid_argument("unsupported MatchSettingsV1 victory mode");
}

MatchVictoryMode parse_victory_mode(const std::string& value) {
    if (value == "conquest") return MatchVictoryMode::conquest;
    throw std::invalid_argument("unsupported MatchSettingsV1 victory mode");
}

}  // namespace

MatchSettingsV1 default_match_settings_v1() {
    const LockstepSessionConfig lockstep;
    return {
        match_settings_version,
        lockstep.build_id,
        nostr_match_protocol_version,
        lockstep_protocol_version,
        reconstruction_command_schema_version,
        reconstruction_save_version,
        reconstruction_scenario_version,
        lockstep.content_rules_digest,
        RandomMapKind::arabia,
        RandomMapSize::normal,
        1,
        Civilization::britons,
        Civilization::franks,
        match_settings_population_limit,
        MatchVictoryMode::conquest,
    };
}

void validate_match_settings_v1(const MatchSettingsV1& settings) {
    const auto invalid = [](std::string_view field) {
        throw std::invalid_argument(
            "invalid MatchSettingsV1 " + std::string{field}
        );
    };
    if (settings.version != match_settings_version) invalid("version");
    if (settings.build_id.empty() || settings.build_id.size() > 128) {
        invalid("build ID");
    }
    if (settings.nostr_protocol_version != nostr_match_protocol_version) {
        invalid("Nostr protocol version");
    }
    if (settings.lockstep_protocol_version != lockstep_protocol_version) {
        invalid("lockstep protocol version");
    }
    if (settings.command_schema_version !=
            reconstruction_command_schema_version) {
        invalid("command schema version");
    }
    if (settings.save_version != reconstruction_save_version) {
        invalid("save version");
    }
    if (settings.scenario_version != reconstruction_scenario_version) {
        invalid("scenario version");
    }
    if (settings.content_rules_digest.empty() ||
        settings.content_rules_digest.size() > 256) {
        invalid("content rules digest");
    }
    static_cast<void>(map_kind_name(settings.map_kind));
    static_cast<void>(map_size_name(settings.map_size));
    static_cast<void>(civilization_name(settings.blue_civilization));
    static_cast<void>(civilization_name(settings.red_civilization));
    if (settings.population_limit != match_settings_population_limit) {
        invalid("population limit");
    }
    static_cast<void>(victory_mode_name(settings.victory_mode));
}

std::string canonical_match_settings_v1(const MatchSettingsV1& settings) {
    validate_match_settings_v1(settings);
    std::ostringstream output;
    output << "match-settings-v1 "
           << settings.version << ' '
           << std::quoted(settings.build_id) << ' '
           << settings.nostr_protocol_version << ' '
           << settings.lockstep_protocol_version << ' '
           << settings.command_schema_version << ' '
           << settings.save_version << ' '
           << settings.scenario_version << ' '
           << std::quoted(settings.content_rules_digest) << ' '
           << map_kind_name(settings.map_kind) << ' '
           << map_size_name(settings.map_size) << ' '
           << settings.seed << ' '
           << civilization_name(settings.blue_civilization) << ' '
           << civilization_name(settings.red_civilization) << ' '
           << settings.population_limit << ' '
           << victory_mode_name(settings.victory_mode);
    return output.str();
}

MatchSettingsV1 decode_match_settings_v1(const std::string& bytes) {
    if (bytes.empty() || bytes.size() > 2048) {
        throw std::invalid_argument("invalid MatchSettingsV1 byte length");
    }
    std::istringstream input(bytes);
    std::string magic;
    std::string map_kind;
    std::string map_size;
    std::string blue_civilization;
    std::string red_civilization;
    std::string victory_mode;
    MatchSettingsV1 settings;
    input >> magic >> settings.version >> std::quoted(settings.build_id)
          >> settings.nostr_protocol_version
          >> settings.lockstep_protocol_version
          >> settings.command_schema_version >> settings.save_version
          >> settings.scenario_version
          >> std::quoted(settings.content_rules_digest)
          >> map_kind >> map_size >> settings.seed
          >> blue_civilization >> red_civilization
          >> settings.population_limit >> victory_mode;
    if (!input || magic != "match-settings-v1") {
        throw std::invalid_argument("invalid MatchSettingsV1 encoding");
    }
    settings.map_kind = parse_map_kind(map_kind);
    settings.map_size = parse_map_size(map_size);
    settings.blue_civilization = parse_civilization(blue_civilization);
    settings.red_civilization = parse_civilization(red_civilization);
    settings.victory_mode = parse_victory_mode(victory_mode);
    validate_match_settings_v1(settings);
    if (canonical_match_settings_v1(settings) != bytes) {
        throw std::invalid_argument("non-canonical MatchSettingsV1 encoding");
    }
    return settings;
}

std::string match_settings_v1_digest(const MatchSettingsV1& settings) {
    std::uint64_t hash = 14695981039346656037ULL;
    for (const unsigned char byte : canonical_match_settings_v1(settings)) {
        hash ^= byte;
        hash *= 1099511628211ULL;
    }
    std::ostringstream output;
    output << "match-settings-v1-fnv1a64:" << std::hex
           << std::setfill('0') << std::setw(16) << hash;
    return output.str();
}

bool NostrSenderSequence::same_event(
    const NostrLogicalEvent& left,
    const NostrLogicalEvent& right
) {
    return left.event_id == right.event_id &&
        left.previous_event_id == right.previous_event_id &&
        left.content == right.content;
}

NostrSequenceAccept NostrSenderSequence::accept(
    NostrLogicalEvent event
) {
    if (conflicted_ || event.sequence == 0 || event.event_id.empty()) {
        return NostrSequenceAccept::conflict;
    }
    if (event.sequence <= highest_contiguous_sequence_) {
        const auto found = accepted_.find(event.sequence);
        if (found != accepted_.end() && same_event(found->second, event)) {
            return NostrSequenceAccept::duplicate;
        }
        conflicted_ = true;
        return NostrSequenceAccept::conflict;
    }
    if (event.sequence > highest_contiguous_sequence_ +
            nostr_max_future_sender_sequences) {
        return NostrSequenceAccept::out_of_bounds;
    }
    const auto found = future_.find(event.sequence);
    if (found == future_.end()) {
        future_.emplace(event.sequence, std::move(event));
        return NostrSequenceAccept::buffered;
    }
    if (same_event(found->second, event)) {
        return NostrSequenceAccept::duplicate;
    }
    conflicted_ = true;
    return NostrSequenceAccept::conflict;
}

NostrSequenceDrain NostrSenderSequence::drain() {
    NostrSequenceDrain result;
    if (conflicted_) {
        result.conflict = true;
        result.reason = "sender stream already conflicted";
        return result;
    }
    while (true) {
        const std::uint64_t expected = highest_contiguous_sequence_ + 1;
        const auto found = future_.find(expected);
        if (found == future_.end()) break;
        const std::string expected_previous =
            highest_contiguous_sequence_ == 0 ? std::string{} : last_event_id_;
        if (found->second.previous_event_id != expected_previous) {
            conflicted_ = true;
            result.conflict = true;
            result.reason = "sender previous-event chain mismatch";
            return result;
        }
        NostrLogicalEvent accepted = std::move(found->second);
        future_.erase(found);
        highest_contiguous_sequence_ = accepted.sequence;
        last_event_id_ = accepted.event_id;
        accepted_[accepted.sequence] = accepted;
        result.contiguous.push_back(std::move(accepted));
        while (accepted_.size() > nostr_max_future_sender_sequences * 2) {
            accepted_.erase(accepted_.begin());
        }
    }
    return result;
}

std::vector<std::pair<std::uint64_t, std::uint64_t>>
NostrSenderSequence::missing_ranges() const {
    std::vector<std::pair<std::uint64_t, std::uint64_t>> ranges;
    if (future_.empty()) return ranges;
    std::uint64_t cursor = highest_contiguous_sequence_ + 1;
    for (const auto& [sequence, event] : future_) {
        static_cast<void>(event);
        if (cursor < sequence) ranges.emplace_back(cursor, sequence - 1);
        cursor = sequence + 1;
    }
    return ranges;
}

}  // namespace aoe
