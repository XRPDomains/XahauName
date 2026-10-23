#include "common.h"
#pragma clang attribute pop
__attribute__((flatten)) int64_t hook(uint32_t ctx){_g(1,1);return lifecycle_dispatch(ctx);}
