{
  "targets": [
    {
      "target_name": "mouse_state",
      "sources": ["mouse_state.cc"],
      "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")"],
      "dependencies": ["<!(node -p \"require('node-addon-api').gyp\")"],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "conditions": [
        [
          "OS=='win'",
          {
            "msbuild_toolset": "v143"
          }
        ]
      ]
    }
  ]
}
