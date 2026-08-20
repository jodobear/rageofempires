set(AOE_WEB_DIST_DIR "${CMAKE_BINARY_DIR}/dist")
set(AOE_NAPPLET_DIST_DIR "${CMAKE_BINARY_DIR}/napplet-dist")
set(AOE_NAPPLET_SHELL "${CMAKE_BINARY_DIR}/napplet-shell.html")
set(AOE_NAPPLET_MANIFEST
    "${AOE_NAPPLET_DIST_DIR}/.nip5a-manifest.json")
set(AOE_WEB_ASSET_DIR "${CMAKE_BINARY_DIR}/web-assets")
set(AOE_BROWSER_TEST_PYTHON "python3" CACHE STRING
    "Host Python command with Selenium for browser acceptance")

find_program(AOE_NPM_EXECUTABLE npm REQUIRED)
set(AOE_NOSTR_SOURCE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/web/nostr")
set(AOE_NOSTR_BUNDLE "${CMAKE_BINARY_DIR}/nostr/aoe_nostr.js")
set(AOE_NAPPLET_NOSTR_BUNDLE
    "${CMAKE_BINARY_DIR}/nostr/aoe_napplet_nostr.js")
set(AOE_NOSTR_INPUTS
    "${AOE_NOSTR_SOURCE_DIR}/package.json"
    "${AOE_NOSTR_SOURCE_DIR}/package-lock.json"
    "${AOE_NOSTR_SOURCE_DIR}/tsconfig.json"
    "${AOE_NOSTR_SOURCE_DIR}/scripts/build.mjs"
    "${AOE_NOSTR_SOURCE_DIR}/src/browser-event-author.ts"
    "${AOE_NOSTR_SOURCE_DIR}/src/browser-relay-transport.ts"
    "${AOE_NOSTR_SOURCE_DIR}/src/bridge.ts"
    "${AOE_NOSTR_SOURCE_DIR}/src/event-author.ts"
    "${AOE_NOSTR_SOURCE_DIR}/src/napplet-api.ts"
    "${AOE_NOSTR_SOURCE_DIR}/src/napplet-entry.ts"
    "${AOE_NOSTR_SOURCE_DIR}/src/napplet-event-author.ts"
    "${AOE_NOSTR_SOURCE_DIR}/src/napplet-relay-transport.ts"
    "${AOE_NOSTR_SOURCE_DIR}/src/protocol.ts"
    "${AOE_NOSTR_SOURCE_DIR}/src/relay-transport.ts"
    "${AOE_NOSTR_SOURCE_DIR}/src/runtime.ts"
    "${AOE_NOSTR_SOURCE_DIR}/src/web-entry.ts"
)
add_custom_command(
    OUTPUT "${AOE_NOSTR_BUNDLE}" "${AOE_NAPPLET_NOSTR_BUNDLE}"
    COMMAND "${CMAKE_COMMAND}" -E make_directory
        "${CMAKE_BINARY_DIR}/nostr"
    COMMAND "${AOE_NPM_EXECUTABLE}" ci --ignore-scripts
    COMMAND "${AOE_NPM_EXECUTABLE}" run typecheck
    COMMAND "${CMAKE_COMMAND}" -E env
        "AOE_NOSTR_BUNDLE=${AOE_NOSTR_BUNDLE}"
        "AOE_NAPPLET_NOSTR_BUNDLE=${AOE_NAPPLET_NOSTR_BUNDLE}"
        "${AOE_NPM_EXECUTABLE}" run build
    WORKING_DIRECTORY "${AOE_NOSTR_SOURCE_DIR}"
    DEPENDS ${AOE_NOSTR_INPUTS}
    COMMENT "Building pinned Applesauce browser runtime"
    VERBATIM
)
add_custom_target(nostr_browser_bundle DEPENDS
    "${AOE_NOSTR_BUNDLE}" "${AOE_NAPPLET_NOSTR_BUNDLE}")

set(AOE_WEB_CORE_SOURCES ${AOE_CORE_SOURCES})
list(REMOVE_ITEM AOE_WEB_CORE_SOURCES
    src/commercial_multiplayer_service.cpp
    src/multiplayer_transport.cpp
)
list(APPEND AOE_WEB_CORE_SOURCES
    src/nostr_browser_bridge.cpp
    src/nostr_multiplayer_runtime.cpp
)
add_library(aoe_web_core STATIC ${AOE_WEB_CORE_SOURCES})
target_include_directories(
    aoe_web_core PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}/include"
    PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/generated"
)
target_link_libraries(aoe_web_core PUBLIC ZLIB::ZLIB)
target_compile_definitions(aoe_web_core PRIVATE AOE_NO_NATIVE_TCP=1)
target_compile_options(aoe_web_core PRIVATE -Wall -Wextra -Wpedantic)

add_custom_target(web_asset_pack
    COMMAND "${Python3_EXECUTABLE}"
        "${CMAKE_CURRENT_SOURCE_DIR}/tools/build_web_asset_pack.py"
        --source-root "${CMAKE_CURRENT_SOURCE_DIR}"
        --output-root "${AOE_WEB_ASSET_DIR}"
    BYPRODUCTS
        "${AOE_WEB_ASSET_DIR}/web_asset_manifest.json"
    VERBATIM
)

add_library(aoe_browser_app STATIC
    "${CMAKE_CURRENT_SOURCE_DIR}/src/browser_application.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/src/sdl_app.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/src/application_loop.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/src/runtime_paths_web.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/src/browser_telemetry_web.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/src/audio_system_web.cpp"
)
target_include_directories(
    aoe_browser_app PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}/include"
)
target_link_libraries(aoe_browser_app PUBLIC aoe_web_core SDL3::SDL3)
target_compile_definitions(aoe_browser_app PRIVATE
    AOE_BROWSER_FIXED_ASSET_SCOPE=1
    AOE_HAVE_NATIVE_MP3=0
    AOE_HAVE_MPG123=0
)
target_compile_options(aoe_browser_app PRIVATE
    -Wall
    -Wextra
    -Wpedantic
    -fexceptions
)

function(
    aoe_add_browser_executable
    target entrypoint output_name dist_dir shell_file
)
    add_executable(
        "${target}" "${CMAKE_CURRENT_SOURCE_DIR}/${entrypoint}"
    )
    target_link_libraries("${target}" PRIVATE aoe_browser_app)
    add_dependencies("${target}" web_asset_pack)
    target_compile_options("${target}" PRIVATE
        -Wall
        -Wextra
        -Wpedantic
        -fexceptions
    )
    target_link_options("${target}" PRIVATE
        -fexceptions
        "SHELL:-lidbfs.js"
        "SHELL:-s ALLOW_MEMORY_GROWTH=1"
        "SHELL:-s FORCE_FILESYSTEM=1"
        "SHELL:-s MIN_WEBGL_VERSION=2"
        "SHELL:-s MAX_WEBGL_VERSION=2"
        "SHELL:-s EXIT_RUNTIME=0"
        "SHELL:-s ENVIRONMENT=web"
        "SHELL:-s INVOKE_RUN=0"
        "SHELL:-s EXPORTED_RUNTIME_METHODS=['callMain','HEAPU8']"
        "SHELL:-s EXPORTED_FUNCTIONS=['_main','_malloc','_free','_aoe_nostr_enqueue_event','_aoe_nostr_enqueue_status','_aoe_nostr_publish_result']"
        "SHELL:--pre-js ${CMAKE_CURRENT_SOURCE_DIR}/web/browser_runtime.js"
        "SHELL:--shell-file ${shell_file}"
    )
    set_target_properties("${target}" PROPERTIES
        OUTPUT_NAME "${output_name}"
        SUFFIX ".html"
        RUNTIME_OUTPUT_DIRECTORY "${dist_dir}"
        LINK_DEPENDS
            "${shell_file};${CMAKE_CURRENT_SOURCE_DIR}/web/browser_runtime.js;${AOE_WEB_ASSET_DIR}/web_asset_manifest.json"
    )
endfunction()

if(AOE_BUILD_WEB)
    aoe_add_browser_executable(
        aoe_web src/web_main.cpp aoe_web "${AOE_WEB_DIST_DIR}"
        "${CMAKE_CURRENT_SOURCE_DIR}/web/shell.html"
    )
    add_dependencies(aoe_web nostr_browser_bundle)
    set_property(TARGET aoe_web APPEND PROPERTY LINK_DEPENDS
        "${AOE_NOSTR_BUNDLE}"
    )
    target_compile_definitions(aoe_web PRIVATE AOE_WEB_BUILD=1)
    target_link_options(aoe_web PRIVATE
        "SHELL:--preload-file ${AOE_WEB_ASSET_DIR}/resources@/resources"
        "SHELL:--preload-file ${AOE_WEB_ASSET_DIR}/game_data/Bin@/game_data/Bin"
        "SHELL:--preload-file ${AOE_WEB_ASSET_DIR}/game_data/Data@/game_data/Data"
        "SHELL:--preload-file ${AOE_WEB_ASSET_DIR}/game_data/Terrain@/game_data/Terrain"
    )
    add_custom_command(TARGET aoe_web POST_BUILD
        COMMAND "${CMAKE_COMMAND}" -E make_directory
            "${AOE_WEB_DIST_DIR}/game_data/Sound/music"
        COMMAND "${CMAKE_COMMAND}" -E make_directory
            "${AOE_WEB_DIST_DIR}/game_data/Sound/effects"
        COMMAND "${CMAKE_COMMAND}" -E copy_if_different
            "${AOE_WEB_ASSET_DIR}/game_data/Sound/music/xmusic1.mp3"
            "${AOE_WEB_DIST_DIR}/game_data/Sound/music/xmusic1.mp3"
        COMMAND "${CMAKE_COMMAND}" -E copy_directory
            "${CMAKE_CURRENT_SOURCE_DIR}/game_data/Sound/effects"
            "${AOE_WEB_DIST_DIR}/game_data/Sound/effects"
        COMMAND "${CMAKE_COMMAND}" -E copy_if_different
            "${CMAKE_CURRENT_SOURCE_DIR}/web/styles.css"
            "${AOE_WEB_DIST_DIR}/styles.css"
        COMMAND "${CMAKE_COMMAND}" -E copy_if_different
            "${AOE_NOSTR_BUNDLE}"
            "${AOE_WEB_DIST_DIR}/aoe_nostr.js"
        VERBATIM
    )
endif()

if(AOE_BUILD_NAPPLET)
    add_custom_command(
        OUTPUT "${AOE_NAPPLET_SHELL}"
        COMMAND "${Python3_EXECUTABLE}"
            "${CMAKE_CURRENT_SOURCE_DIR}/tools/build_napplet_package.py"
            prepare-shell
            --template "${CMAKE_CURRENT_SOURCE_DIR}/web/shell.html"
            --styles "${CMAKE_CURRENT_SOURCE_DIR}/web/styles.css"
            --nostr "${AOE_NAPPLET_NOSTR_BUNDLE}"
            --output "${AOE_NAPPLET_SHELL}"
        DEPENDS
            "${CMAKE_CURRENT_SOURCE_DIR}/tools/build_napplet_package.py"
            "${CMAKE_CURRENT_SOURCE_DIR}/web/shell.html"
            "${CMAKE_CURRENT_SOURCE_DIR}/web/styles.css"
            "${AOE_NAPPLET_NOSTR_BUNDLE}"
        VERBATIM
    )
    add_custom_target(napplet_shell DEPENDS "${AOE_NAPPLET_SHELL}")
    aoe_add_browser_executable(
        aoe_napplet src/napplet_main.cpp index
        "${AOE_NAPPLET_DIST_DIR}" "${AOE_NAPPLET_SHELL}"
    )
    add_dependencies(aoe_napplet napplet_shell)
    target_compile_definitions(aoe_napplet PRIVATE AOE_NAPPLET_BUILD=1)
    target_link_options(aoe_napplet PRIVATE
        "SHELL:--pre-js ${CMAKE_CURRENT_SOURCE_DIR}/web/napplet_runtime.js"
        "SHELL:-s SINGLE_FILE=1"
        "SHELL:--embed-file ${AOE_WEB_ASSET_DIR}/resources@/resources"
        "SHELL:--embed-file ${AOE_WEB_ASSET_DIR}/game_data/Bin@/game_data/Bin"
        "SHELL:--embed-file ${AOE_WEB_ASSET_DIR}/game_data/Data@/game_data/Data"
        "SHELL:--embed-file ${AOE_WEB_ASSET_DIR}/game_data/Terrain@/game_data/Terrain"
        "SHELL:--embed-file ${AOE_WEB_ASSET_DIR}/game_data/Sound/music/xmusic1.mp3@/game_data/Sound/music/xmusic1.mp3"
        "SHELL:--embed-file ${CMAKE_CURRENT_SOURCE_DIR}/game_data/Sound/effects@/game_data/Sound/effects"
    )
    set_property(TARGET aoe_napplet APPEND PROPERTY LINK_DEPENDS
        "${CMAKE_CURRENT_SOURCE_DIR}/web/napplet_runtime.js"
        "${CMAKE_CURRENT_SOURCE_DIR}/tools/build_napplet_package.py"
    )
    add_custom_command(TARGET aoe_napplet PRE_LINK
        COMMAND "${CMAKE_COMMAND}" -E remove_directory
            "${AOE_NAPPLET_DIST_DIR}"
        COMMAND "${CMAKE_COMMAND}" -E make_directory
            "${AOE_NAPPLET_DIST_DIR}"
        VERBATIM
    )
    add_custom_command(TARGET aoe_napplet POST_BUILD
        COMMAND "${Python3_EXECUTABLE}"
            "${CMAKE_CURRENT_SOURCE_DIR}/tools/build_napplet_package.py"
            manifest
            --html "${AOE_NAPPLET_DIST_DIR}/index.html"
            --output "${AOE_NAPPLET_MANIFEST}"
        COMMAND "${Python3_EXECUTABLE}"
            "${CMAKE_CURRENT_SOURCE_DIR}/tools/build_napplet_package.py"
            verify
            --html "${AOE_NAPPLET_DIST_DIR}/index.html"
            --manifest "${AOE_NAPPLET_MANIFEST}"
        VERBATIM
    )
endif()

if(AOE_BUILD_WEB)
    add_custom_target(web_risk_spike
        COMMAND "${Python3_EXECUTABLE}"
            "${CMAKE_CURRENT_SOURCE_DIR}/tools/test_build_web_asset_pack.py"
        COMMAND "${AOE_BROWSER_TEST_PYTHON}"
            "${CMAKE_CURRENT_SOURCE_DIR}/tests/web/browser_risk_spike_test.py"
            --browser chrome
            --evidence "${CMAKE_CURRENT_SOURCE_DIR}/artifacts/browser-risk-spike/evidence-chrome.json"
        COMMAND "${AOE_BROWSER_TEST_PYTHON}"
            "${CMAKE_CURRENT_SOURCE_DIR}/tests/web/browser_risk_spike_test.py"
            --browser chrome
            --display-matrix
        COMMAND "${AOE_BROWSER_TEST_PYTHON}"
            "${CMAKE_CURRENT_SOURCE_DIR}/tests/web/browser_risk_spike_test.py"
            --browser chrome
            --persistence-checks
        DEPENDS aoe_web
        USES_TERMINAL
        VERBATIM
    )

    add_custom_target(web_nostr_multiplayer_smoke
        COMMAND "${AOE_BROWSER_TEST_PYTHON}"
            "${CMAKE_CURRENT_SOURCE_DIR}/tests/web/nostr_multiplayer_smoke_test.py"
            --evidence
            "${CMAKE_CURRENT_SOURCE_DIR}/artifacts/nostr-multiplayer/production-smoke.json"
        DEPENDS aoe_web
        USES_TERMINAL
        VERBATIM
    )
endif()
