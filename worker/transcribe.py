#!/usr/bin/env python3
"""Transcription mot à mot d'un WAV 16 kHz avec mlx-whisper (local, Apple Silicon).

Usage : transcribe.py <audio.wav> <sortie.json> [langue]
Sortie : {"language", "segments": [{start, end, text}], "words": [{w, t, e}]}
Temps en secondes, dans le rush d'origine.
Un seul processus à la fois : paralléliser fait chuter le débit (contention GPU).
"""
import json
import sys

import mlx_whisper

MODEL = "mlx-community/whisper-large-v3-turbo"


def main():
    audio, out = sys.argv[1], sys.argv[2]
    language = sys.argv[3] if len(sys.argv) > 3 else None
    result = mlx_whisper.transcribe(
        audio,
        path_or_hf_repo=MODEL,
        word_timestamps=True,
        language=language,
        condition_on_previous_text=False,
    )
    segments, words = [], []
    for seg in result.get("segments", []):
        segments.append({"start": round(seg["start"], 3), "end": round(seg["end"], 3), "text": seg["text"].strip()})
        for w in seg.get("words", []):
            text = w["word"].strip()
            if text:
                words.append({"w": text, "t": round(w["start"], 3), "e": round(w["end"], 3)})
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"language": result.get("language"), "segments": segments, "words": words}, f, ensure_ascii=False)


if __name__ == "__main__":
    main()
