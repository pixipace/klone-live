# Sound effects for clips

Same drop-in pattern as music. Optional. Empty folder = no SFX, no
error.

## Folders

```
assets/sfx/
└── hook-in/    short whoosh / swoosh / pop sounds (~0.3-0.8s)
                played at clip start when the hook title fades in
```

The picker grabs a random file from the relevant folder per clip.

## Sourcing

- **[Pixabay Sound Effects](https://pixabay.com/sound-effects/)** —
  search "whoosh transition", "swoosh", "pop", "swipe". No attribution
  needed.
- **[Freesound](https://freesound.org/)** — huge library. Most tracks
  are CC-BY (need attribution via sidecar JSON like with music).

## What works for hook-in

- Soft whooshes (~0.4s)
- Quick rising sweeps
- Subtle ding/chime
- Audio rises to peak as the hook overlay fully fades in

## What to avoid

- Loud "BOOM" effects (jarring)
- Cartoon "boing" sounds (cheap)
- Long sweeps > 1.2s (overlap weirdly with speaker)
- Anything that sounds like a notification (confusing)

## Disable

Empty `hook-in/` directory. Cutter detects it and skips SFX
application — no error.

## Attribution

Same sidecar JSON pattern as music — drop a `whoosh.mp3.json` next to
the SFX with `attributionRequired: true` if needed. Currently SFX
attribution does NOT auto-append to the caption (would be noisy).
Worth adding if you want that — file an issue.
