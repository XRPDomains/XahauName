/* Test-only recipient hook. Install with HookOn restricted to transaction type 48. */
#include "hookapi.h"
int64_t hook(uint32_t reserved) {
    _g(1,1);
    return rollback(SBUF("test reject offer"),777);
}
