---
title: ApanaVidEditor Voice Clone
emoji: 🎙️
colorFrom: indigo
colorTo: pink
sdk: gradio
sdk_version: 6.30.0
python_version: "3.10"
app_file: app.py
pinned: false
license: other
---

Voice cloning backend for [ApanaVidEditor](https://rakeshmkr720042.github.io/ApanaVidEditor/).

API: `/clone(reference: audio file, text: str, language: str, speed: float) -> wav`.

The model is Coqui XTTS v2, released under the Coqui Public Model License, which allows non-commercial use only.
