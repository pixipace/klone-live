# Background music for clips

The clipper auto-picks a track per clip based on the clip's mood.
Gemma classifies each clip's mood from its transcript + hook, then
the picker grabs a random file from the matching mood folder.

## Folder structure

```
assets/music/
├── energetic/       fast tempo, drums, builds — exciting reveals, story climaxes
├── chill/           lo-fi, ambient — relaxed talks, philosophical
├── dramatic/        cinematic, suspense — heavy topics, big stakes
├── hopeful/         uplifting piano, strings — transformation stories
├── motivational/    corporate uplifting, claps — tactical advice, CTAs
├── comedic/         quirky, playful — jokes, light banter
├── urgent/          tight rhythm, intense — warnings, "don't do this"
├── neutral/         safe default — informational
└── *.mp3            tracks placed at the root are fallbacks if a mood
                    folder is empty
```

The picker tries the mood folder first. If it's empty (or doesn't
exist), it falls back to the flat root. So you can start with 5
tracks at the root and migrate to mood folders later — both work.

If everything is empty, clips ship without music (no error).

## Where to get tracks

- **Pixabay** (no attribution, commercial OK): https://pixabay.com/music/
  Search "lo-fi", "corporate", "cinematic", "comedy" etc.
- **YouTube Audio Library** (free): https://www.youtube.com/audiolibrary
  Filter by mood/genre.
- **Uppbeat free tier**: https://uppbeat.io/

## Recommended starting library

5 tracks per mood = 40 total = solid variety. Try to keep tracks:
- 30-90 seconds (or instrumental loops)
- No vocals (they fight with the speaker)
- Consistent loudness within a mood (saves you remixing)

## Disable music globally

Empty all directories. The pipeline detects no tracks → skips music.
