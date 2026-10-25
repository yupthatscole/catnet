// catnet — by cole (github.com/yupthatscole)
#pragma once
#include <cstdint>
#include <cstdlib>
#include <cstddef>
inline void esp_fill_random(void *buf, size_t n) {
  uint8_t *p = (uint8_t *)buf;
  for (size_t i = 0; i < n; i++) p[i] = (uint8_t)(rand() & 0xff);
}
inline uint32_t esp_random() { return ((uint32_t)rand() << 16) ^ (uint32_t)rand(); }
