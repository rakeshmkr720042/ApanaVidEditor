"""ApanaVidEditor voice cloning Space.

Takes a short recording of someone's voice and a line of text, and returns that
line spoken in the same voice, using Coqui XTTS v2 (17 languages incl. Hindi).
The app calls the `/clone` endpoint once per subtitle line.
"""
import hashlib
import os
import tempfile

os.environ["COQUI_TOS_AGREED"] = "1"  # XTTS v2 is under the Coqui Public Model License (non-commercial)

import gradio as gr
import numpy as np
import torch
from scipy.io import wavfile
from TTS.api import TTS

LANGUAGES = ["en", "hi", "es", "fr", "de", "it", "pt", "pl", "tr", "ru", "nl", "cs", "ar", "zh-cn", "ja", "hu", "ko"]

device = "cuda" if torch.cuda.is_available() else "cpu"
torch.set_num_threads(os.cpu_count() or 2)
tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
model = tts.synthesizer.tts_model

# The same reference voice is sent for every line of a video, so its speaker
# embedding is worked out once and reused.
_latents: dict[str, tuple] = {}


def _speaker(path: str):
    with open(path, "rb") as f:
        key = hashlib.sha1(f.read()).hexdigest()
    if key not in _latents:
        if len(_latents) > 32:
            _latents.clear()
        _latents[key] = model.get_conditioning_latents(audio_path=[path], gpt_cond_len=30, max_ref_length=60)
    return _latents[key]


def clone(reference: str, text: str, language: str, speed: float = 1.0):
    if not reference:
        raise gr.Error("Upload or record a reference voice first")
    text = (text or "").strip()
    if not text:
        raise gr.Error("Text is empty")
    language = (language or "en").lower()
    if language == "zh":
        language = "zh-cn"
    if language not in LANGUAGES:
        raise gr.Error(f"Language '{language}' is not supported. Supported: {', '.join(LANGUAGES)}")
    gpt_latent, speaker_embedding = _speaker(reference)
    with torch.inference_mode():
        out = model.inference(
            text, language, gpt_latent, speaker_embedding,
            temperature=0.7, speed=float(speed or 1.0), enable_text_splitting=True,
        )
    wav = np.clip(np.asarray(out["wav"], dtype=np.float32), -1, 1)
    path = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
    wavfile.write(path, 24000, (wav * 32767).astype(np.int16))
    return path


demo = gr.Interface(
    fn=clone,
    inputs=[
        gr.Audio(type="filepath", label="Reference voice (10 to 30 seconds of clear speech)"),
        gr.Textbox(label="Text to speak", lines=3),
        gr.Dropdown(LANGUAGES, value="hi", label="Language"),
        gr.Slider(0.7, 1.5, value=1.0, step=0.05, label="Speed"),
    ],
    outputs=gr.Audio(type="filepath", label="Cloned voice"),
    title="ApanaVidEditor Voice Clone",
    description="Record or upload your voice, type a line, and hear it in your own voice. Powered by Coqui XTTS v2.",
    api_name="clone",
    concurrency_limit=1,
    flagging_mode="never",
)

if __name__ == "__main__":
    demo.queue(max_size=64).launch()
