#include "aoe/browser_application.hpp"

#ifndef AOE_NAPPLET_BUILD
#error "aoe_napplet requires its target-scoped build definition"
#endif

#ifdef AOE_WEB_BUILD
#error "normal-web definitions must not leak into aoe_napplet"
#endif

int main() {
    return aoe::run_browser_application();
}
