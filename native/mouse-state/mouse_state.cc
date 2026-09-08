// Two small win32-only helpers that Electron/JS have no way to do on
// their own:
//
//   isLeftButtonDown() — is the left mouse button currently physically
//   held down? GetAsyncKeyState is the standard, simple way to ask
//   Windows this directly — it's a real-time hardware query, not tied to
//   any window's message queue, so it works regardless of what a
//   window-drag operation is doing to normal input event delivery
//   elsewhere in the app.
//
//   setWindowCornerPreference(handle, preference) — forces DWM's Windows
//   11 corner-rounding on or off for a given HWND. Electron's frameless
//   (WS_POPUP-style) windows opt themselves out of the automatic corner
//   rounding every normal top-level window gets on Windows 11, so
//   without this call Disc's window has flat square corners no matter
//   what CSS does — DWM clips the actual window surface itself, not
//   something a page can influence. `handle` is the Buffer returned by
//   BrowserWindow#getNativeWindowHandle(); `preference` is one of the
//   DWMWCP_* values below.
#include <napi.h>
#include <windows.h>
#include <dwmapi.h>

// Not guaranteed present in every Windows SDK this project might build
// against (added alongside Windows 11's DWM APIs) — defined by hand so a
// slightly older SDK still compiles. DwmSetWindowAttribute just wants a
// pointer to a plain DWORD-sized value, so no enum/typedef is needed.
#ifndef DWMWA_WINDOW_CORNER_PREFERENCE
#define DWMWA_WINDOW_CORNER_PREFERENCE 33
#endif

namespace {

Napi::Value IsLeftButtonDown(const Napi::CallbackInfo& info) {
  // High bit set means the key/button is currently down.
  bool down = (GetAsyncKeyState(VK_LBUTTON) & 0x8000) != 0;
  return Napi::Boolean::New(info.Env(), down);
}

Napi::Value SetWindowCornerPreference(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsBuffer() || !info[1].IsNumber()) {
    return env.Undefined();
  }
  Napi::Buffer<uint8_t> handle = info[0].As<Napi::Buffer<uint8_t>>();
  if (handle.Length() < sizeof(HWND)) return env.Undefined();
  HWND hwnd = *reinterpret_cast<HWND*>(handle.Data());
  DWORD preference = static_cast<DWORD>(info[1].As<Napi::Number>().Uint32Value());
  // Best-effort/cosmetic only — a pre-Windows-11 machine (or any other
  // failure) just leaves the window's corners as they already were.
  DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, &preference, sizeof(preference));
  return env.Undefined();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("isLeftButtonDown", Napi::Function::New(env, IsLeftButtonDown));
  exports.Set("setWindowCornerPreference", Napi::Function::New(env, SetWindowCornerPreference));
  return exports;
}

}  // namespace

NODE_API_MODULE(mouse_state, Init)
