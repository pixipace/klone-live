# Background music for clips

The clipper auto-picks a track per clip based on the clip's mood
(Gemma classifies it from transcript + hook), then plays it under the
speaker at -25dB.

## Folder structure

```
assets/music/
├── energetic/       fast tempo, drums — story climaxes
├── chill/           lo-fi, ambient — relaxed talks
├── dramatic/        cinematic, suspense — heavy topics
├── hopeful/         uplifting — transformation stories
├── motivational/    corporate uplifting — tactical advice
├── comedic/         quirky — jokes, banter
├── urgent/          tight rhythm — warnings
├── neutral/         safe default
└── *.mp3            files at the root are fallbacks if a mood
                    folder is empty
```

The picker tries the mood folder first, falls back to the flat root.
If everything is empty, clips ship without music silently (no error).

## Attribution / credit (sidecar JSON)

For tracks that **require credit** (Creative Commons BY, etc.), drop a
sidecar JSON next to the MP3 with the same name plus `.json`:

```
assets/music/chill/lofi-track.mp3
assets/music/chill/lofi-track.mp3.json
```

JSON format:

```json
{
  "title": "Lofi Track",
  "artist": "Jane Doe",
  "license": "CC-BY 4.0",
  "attributionRequired": true,
  "attributionText": "♪ Music: Lofi Track by Jane Doe (CC-BY 4.0)",
  "sourceUrl": "https://example.com/track-page"
}
```

When that track is picked for a clip, `attributionText` is **auto-
appended to the caption** when the user clicks Send to Compose. Pre-
fills, user can edit/move it.

If `attributionText` is omitted, a default is built from `title +
artist + license`. If `attributionRequired: false` (or no sidecar at
all), no attribution gets added.

## Where to source tracks

| Source | Attribution? | API access | Notes |
|---|---|---|---|
| **[Pixabay Music](https://pixabay.com/music/)** | No (Pixabay license) | Manual download only | Best free option, no credit needed |
| [YouTube Audio Library](https://www.youtube.com/audiolibrary) | Sometimes | None | Some tracks need credit, marked clearly |
| [Jamendo](https://www.jamendo.com/) | Usually yes (CC-BY) | Yes (free tier) | Use sidecar JSON to credit |
| [Uppbeat free tier](https://uppbeat.io/) | Sometimes | API exists | Verify per-track |
| [Mubert](https://mubert.com/) | No (commercial use) | Yes (paid) | AI-generated, infinite variety |

For Pixabay (the recommended free source), since attribution isn't
required for their music license, **just drop the MP3** — no sidecar
JSON needed.

## Recommended starting library

5 tracks per mood = 40 total = clean variety. Try to keep tracks:
- 30-90 seconds (or instrumental loops)
- No vocals (they fight with the speaker)
- Consistent loudness within a mood

## Disable music globally

Empty all directories. The pipeline detects no tracks → skips music.
