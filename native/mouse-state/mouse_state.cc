// One function: is the left mouse button currently physically held down?
// GetAsyncKeyState is the standard, simple way to ask Windows this
// directly — it's a real-time hardware query, not tied to any window's
// message queue, so it works regardless of what a window-drag operation
// is doing to normal input event delivery elsewhere in the app.
#include <napi.h>
#include <windows.h>

namespace {

Napi::Value IsLeftButtonDown(const Napi::CallbackInfo& info) {
  // High bit set means the key/button is currently down.
  bool down = (GetAsyncKeyState(VK_LBUTTON) & 0x8000) != 0;
  return Napi::Boolean::New(info.Env(), down);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("isLeftButtonDown", Napi::Function::New(env, IsLeftButtonDown));
  return exports;
}

}  // namespace

NODE_API_MODULE(mouse_state, Init)
