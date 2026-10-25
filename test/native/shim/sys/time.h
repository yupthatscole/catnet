// catnet — by cole (github.com/yupthatscole)
#pragma once
#include <ctime>
#ifndef _TIMEVAL_DEFINED
#define _TIMEVAL_DEFINED
struct timeval {
  time_t tv_sec;
  long tv_usec;
};
#endif
extern long g_fake_clock;
inline int settimeofday(const struct timeval *tv, const void *) {
  g_fake_clock = (long)tv->tv_sec;
  return 0;
}
