#include "aoe/browser_application.hpp"

#ifndef AOE_WEB_BUILD
#error "aoe_web requires its target-scoped build definition"
#endif

#ifdef AOE_NAPPLET_BUILD
#error "napplet-only definitions must not leak into aoe_web"
#endif

int main() {
    return aoe::run_browser_application();
}
