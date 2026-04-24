# Sound effects for clips

Drop short audio files (~0.3-1.0s) into mood folders. The cutter mixes
them at the right moments per clip. Empty folders = no SFX, no error.

## Folders

```
assets/sfx/
├── hook-in/    short whoosh / swoosh / pop sounds
│               played at t=0 when the hook title fades in
├── hook-out/   soft tail / reverse-whoosh
│               played when the hook fades out (~3.6s mark)
└── outro/      chime / sting / brand stinger
                played 0.6s before clip ends
```

The picker grabs a random file from each folder per clip. Each SFX is
mixed at:

| Folder | Volume | Trigger time (output timeline) |
|---|---|---|
| `hook-in/` | -12dB | t=0 |
| `hook-out/` | -14dB | t = hook_duration − 0.4 (≈3.6s) |
| `outro/` | -12dB | t = clip_duration − 0.6 |

## Sourcing

- **[Pixabay Sound Effects](https://pixabay.com/sound-effects/)** —
  no attribution needed, commercial OK
  - hook-in: search "whoosh transition", "swipe", "swoosh up"
  - hook-out: search "whoosh down", "reverse whoosh", "soft tail"
  - outro: search "chime", "ding", "outro sting", "soft bell"
- **[Freesound](https://freesound.org/)** — huge library, mostly
  CC-BY (use sidecar JSON for attribution)

## What works

- **hook-in:** rising whooshes (~0.3-0.5s), quick sweeps, short pops
- **hook-out:** falling/reverse whooshes, soft fades
- **outro:** brief chimes, short stings, soft bells (NOT loud bells)

## What to avoid

- Anything > 1.2s (overlaps awkwardly with speaker)
- Loud "BOOM" or "DROP" sounds (jarring)
- Cartoon "boing" sounds (cheap)
- Notification dings (confusing — sounds like a phone alert)

## Recommended starting library

3-5 files per folder = good variety without over-repetition.

## Disable

Empty the relevant directory. Cutter detects no files → skips that
SFX moment.

## Background music

Background music is supported via `/assets/music/{mood}/` folders
(see `assets/music/README.md`) but is currently de-emphasized in
favor of SFX-only edits. Drop music tracks if you want background
beds — empty mood folders = no music = SFX-only edits.
