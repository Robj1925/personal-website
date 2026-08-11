---
title: "Grok Voice 2.0 Hears Better Than Transcription Models"
date: "2026-08-04"
excerpt: "xAI's new speech to speech model makes up to 2x fewer errors than Deepgram Nova 3 and ElevenLabs Scribe v2, the models built purely for transcription. In noisy audio the gap grows to roughly 10x."
thumbnail: "assets/images/blog-thumbnails/grok-voice-2-0-hears-better-than-transcription-models.jpg"
youtubeId: "lpkN0GVg7qU"
tags:
  - xAI
  - Grok
  - Voice AI
  - Benchmarks
  - News
---

xAI released Grok Voice Think Fast 2.0, and the headline is not that it talks well. It is that a conversational model now hears better than the models built specifically to do nothing but listen.

It is a speech to speech model, so it talks, it listens, and it reasons while it is still speaking. The numbers behind it are not close.

## It beats the dedicated transcription tools

Across thousands of phrases in 24 languages, Grok Voice 2.0 makes roughly 1.5 to 2 times fewer errors than **Deepgram Nova 3** and **ElevenLabs Scribe v2**.

That comparison is the interesting part. Those two are not conversational models that happen to transcribe. They are purpose built speech to text systems, and transcription is the entire job. Getting beaten by a model that is also holding a conversation and calling tools is not the expected result.

In noisy audio the gap grows to roughly **10x**. That matters more than the clean audio number, because clean audio is not where voice agents live. Phone lines, drive throughs, warehouses, and support calls are all noise, and that is precisely where transcription accuracy normally collapses.

## It thinks while it talks

Most voice models stop to think. You finish speaking, the model processes, then it responds, and that gap is what makes AI phone calls feel like AI phone calls.

Grok Voice 2.0 reasons in parallel with speech, so replies start in **0.70 seconds**, down from 1.25 in Think Fast 1.0. Cutting nearly half a second off the front of every response is the kind of change you feel immediately in conversation rather than notice on a chart.

## The benchmark scoreboard

On the Artificial Analysis speech quality index, as published by xAI:

| | Grok Voice 2.0 | GPT-Realtime 2.1 | Gemini 3.1 Flash |
|---|---|---|---|
| Overall quality index | **82.9** | 79.1 | 69.5 |
| Conversational dynamics | 95.1 | **95.7** | 74.3 |
| Agentic performance | **56.5** | 45.7 | 37.7 |
| Time to first audio | **0.70s** | not published | 2.98s |

Worth being straight about one line in that table: GPT-Realtime 2.1 actually edges Grok on conversational dynamics, 95.7 to 95.1. Grok takes overall quality and wins agentic performance by a wide margin, 56.5 to 45.7, which is the number that matters if the voice agent has to actually do something rather than just chat.

## Pricing and the automatic switch

It runs **8 cents per minute of audio**, flat.

The part to actually note: on **August 5**, `grok-voice-latest` switched to 2.0 automatically. No prompt edits, no migration. If you were pointed at the latest alias, you are already on the new model.

xAI also says it A/B tested this on Starlink's own support line and saw higher sales conversion and better support containment, which is at least a real deployment rather than a demo.

Full announcement is on [xAI's site](https://x.ai/news/grok-voice-think-fast-2).
