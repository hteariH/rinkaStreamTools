# rinkaStreamTools

[Русская версия](README.ru.md)

[![Checks](https://github.com/hteariH/rinkaStreamTools/actions/workflows/ci.yml/badge.svg)](https://github.com/hteariH/rinkaStreamTools/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/hteariH/rinkaStreamTools)](https://github.com/hteariH/rinkaStreamTools/releases/latest)

### [Download for Windows — rinkaStreamTools-win-x64.zip](https://github.com/hteariH/rinkaStreamTools/releases/latest/download/rinkaStreamTools-win-x64.zip)

Unpack it and run `rinkaStreamTools.exe`. Nothing to install.

A set of stream overlays that lives entirely on your own machine: a raffle driven by a
chat command, a shared donation goal across several platforms, a top-donor board, a feed
of recent donations, what is playing right now, a chat poll, donation alerts and
screamers. Everything runs on a single local port — in OBS you add ordinary **Browser
Source** items pointing at `http://localhost:3777/…`, and nothing is exposed to the
outside world.

The project merges two earlier ones: [rinkaRaffle](https://github.com/hteariH/rinkaRaffle)
(the raffle) and rinaDonatesAggragator (donation collection). The Java part of the second
one was rewritten in Node, so this is now a single program with a single launch and one
control panel.

The interface speaks Russian and English — pick the language in the panel header; the
overlays and the server log follow it.

## What is inside

| Overlay | Address | What it shows |
|---|---|---|
| Raffle | `/raffle` | entrant count, the latest entrant, the winner, a countdown |
| Donation goal | `/goal` | a progress bar with the total across every platform |
| Top donors | `/top` | who gave how much, one list across both platforms |
| Recent donations | `/recent` | a scrolling "name — amount" ticker |
| Now playing | `/track` | the current track and artist, with cover art |
| Chat poll | `/poll` | a question, the options and vote bars |
| Donation alerts | `/alerts` | "name — amount" and the message text |
| Screamers | `/screamer` | a random screamer on a donation above a threshold |

The control panel holds the settings, the entrant list, a test donation and the log. It
opens inside the application window, so a streamer never needs a terminal. The same
application also carries a transparent overlay window on top of the game for screamers: a
Browser Source in OBS is seen by viewers only, and without that window the streamer would
be the one person who never sees the screamer.

## Getting started

**The ready-made folder is what you hand to a streamer.**
[Download the archive](https://github.com/hteariH/rinkaStreamTools/releases/latest/download/rinkaStreamTools-win-x64.zip)
(the link always points at the latest release; every version is
[on the releases page](https://github.com/hteariH/rinkaStreamTools/releases)) and unpack
it. There is a single file to run:

```
rinkaStreamTools.exe     <- click this one
server/                  <- the server and its assets, leave it alone
```

Double-click it: the panel window opens and the overlays start working in OBS. The close
button hides the window in the tray and breaks nothing; to quit for real, use Exit in the
tray. Node and Rust are not needed on that machine.

To build it yourself (Node 20+ and Rust on the build machine):

```bash
npm ci
cd desktop && cargo build --release && cd ..
npm run build:exe
```

`cargo build` builds the window, `build:exe` builds the server and lays everything out in
`dist/`.

## Where the data lives and how to update

Settings, the donor table, the recent donations feed and the alert media live **outside
the program folder**, in your user profile:

```
%APPDATA%\rinkaStreamTools\
  config.json      <- settings from the panel
  donors.json      <- the donor table
  recent.json      <- the recent donations feed
  media/           <- GIFs and sounds for alerts
```

That way **an update loses nothing**: download the new archive, unpack it anywhere, run
it, and the settings and donations are still there. They used to live next to the
executable, and that broke against the ordinary way people update: the browser unpacks the
new archive into a sibling folder named "something (1)", you start it from there and end
up with clean settings while the past donations stay in the old folder. On the first run
of a new version, data sitting next to the executable moves into the profile by itself —
copied, not moved, so rolling back to an older version still works.

The path is shown in the panel, on the OBS sources tab, next to an "Open the folder"
button.

**Portable mode.** If you carry the program around (a flash drive, a second computer), put
an empty `data` folder next to `rinkaStreamTools.exe` — everything is then stored there and
the profile is left alone. A `data` folder inside `server/` works too, if that is where you
put it.

## Configuration

Everything is edited in the panel and saved to `config.json` in the data folder. The file
is created on the first run; a sample sits next to the server as `config.example.json`.

Anything can also be edited by hand — the server reads the file on start.

### The raffle

Viewers write the command in chat and land in the list. Chat is read through
[AxelChat](https://github.com/3dproger/AxelChat): it collects YouTube, Twitch, Kick and
the rest into one WebSocket, and this program only listens to it.

Entrants are deduplicated by platform plus name: AxelChat changes the author id from
message to message on some platforms, and by id one viewer would enter the raffle over and
over.

A drawn winner does not come up again, so several prizes can be given away in a row
without clearing the list. The countdown is decoration by default; enable "Draw the winner
automatically" and the winner is drawn the moment it hits zero.

### Chat poll

Viewers vote with the **option number** in the same chat that is already read for the
raffle — the poll needs no separate connection. Typing `2` is a vote for the second
option. If numbers fly around in your chat anyway, set a command, and only `!vote 2`
counts.

One viewer, one vote, keyed by platform plus name, for the same reason as the raffle.
While voting is open a viewer can change their mind — that is a setting.

A vote is **a message that is a single digit and nothing else**: `2` is a vote, `2 out of
10` is ordinary chatter. Otherwise other people's conversations would end up in the count.

Up to nine options: voting takes one keystroke, and two-digit numbers are hard to type
correctly in a live chat.

Close stops accepting votes but leaves the result on the overlay — it usually gets
discussed after the countdown; Hide removes the poll entirely. The countdown is optional
(0 seconds) and you can close the poll by hand.

The leading option is highlighted **only after the poll closes and only if there is
exactly one**: on a live vote the highlight would jump around, and calling the one higher
up the list a winner on a tie would be a lie.

### Donation platforms

DonationAlerts and Donatello are both read through their **widget page** — the same link
you paste into OBS. No login or password is needed, and none is stored anywhere.

Rates are the multiplier from a platform currency to the goal currency. They are
deliberately not fetched from the internet: rates move, and a number on screen should not
jump around mid-stream. If both platforms use the same currency, leave `1`.

There is also a **manual offset** — cash, crypto and anything that went past the platforms.

There are four themes, and the goal, the top, the feed and the track each have their own:
in one scene they usually share a theme, but not always — a thin `slim` bar under the game
and a top panel in the corner live together better than two identical panels.

| Theme | Style |
|---|---|
| `default` | dark panel, gold |
| `slim` | text only, no panel |
| `neon` | cyan on obsidian, border and scan lines |
| `hud` | cyan capsule |

**The nickname and amount colors** are set separately, in the Colors card in the panel, and
apply to three overlays at once — alerts, the top and the feed: these are the same two
roles, and there is no reason for them to drift apart. Until a color is set the theme
decides; the "theme default" button puts it back. Glow and borders still come from the
theme — only the text color changes.

Totals are polled once a minute, plus an extra poll a couple of seconds after every
donation.

### Top donors

Donations from both platforms are merged **by name**: viewers have no shared id across
platforms, and the nickname is the only thing to go by. Two different people with the same
nickname will merge into one, and the panel says so honestly.

Anonymous donations are left out of the list: there is nobody to credit, and lumping them
into one "Anonymous" would invent a donor who does not exist. How many there were and for
how much is shown in the panel on its own line.

The table lives in `donors.json` in the data folder and survives a restart: a stream runs
for hours, and dropping the table on a server reboot is not acceptable. It is built from
live socket events, so donations from **before** the first run will not be in it. "Clear
the table" in the panel wipes everything; a test donation from the panel never enters the
table, so it cannot spoil it on air.

**Editable by hand.** The panel shows the whole table, not just the places that go to the
overlay. The cross removes a donor — say, one whose nickname has no place on screen — and
the form next to it adds a donation that came in past the platforms. A manual amount is
counted directly in the goal currency: platform rates are not applied, since no platform
was involved. It does not move the goal itself — the manual offset does that.

### Recent donations

Donations from both platforms, one by one, newest first. The top answers "who gave the most
overall", the feed answers "what just happened".

It is shown in two different ways:

- **On the overlay — a scrolling ticker**: name and amount only, on a loop, across the
  full width of the source. The line keeps moving, and that is all anyone can read in
  time. How many donations are in the loop and how fast it moves (pixels per second) is set
  in the panel; the speed can also be tuned live with `/recent?speed=120`.
- **In the panel — the full list with messages**: who, how much, at what time and what they
  wrote. The panel sits on a second monitor, and that is exactly where this belongs.

Viewer messages **never reach the overlay** — they are not hidden by a setting, they are
simply not sent: what is not in the frame cannot end up on stream by accident. In the panel
they are trimmed to 140 characters.

Amounts are shown **in the currency they arrived in**, with no platform rates applied:
rates exist for adding things up, and there is nothing to add up in a feed where every line
is a single donation.

Anonymous donations **are** in the feed, unlike the top: there is nobody to credit, but the
event happened, and it belongs in the feed — shown as "Anonymous".

The feed lives in `recent.json` in the data folder and survives a restart. Fifty entries are
kept: the panel shows all of them, the ticker shows as many as you set, and after "show 10
instead of 3" the feed does not start over. "Clear the feed" empties it without touching the
top; a test donation from the panel does not enter the feed.

**Editable by hand.** The cross removes a donation from the feed — a nickname or a message
is sometimes something that has no place on screen. Next to it is a form for adding a
donation that came in past the platforms: cash, a card transfer, a donation from another
program. The feed and the top are separate lists, and adding to one does not touch the
other.

### Donation alerts by tier

A donation lands in a **tier**, by amount. There are three tiers by default: small, medium
and large. A tier sets how long the alert stays up, how loud it looks and whether a screamer
fires.

| Tier | Threshold, USD | Screamer |
|---|---|---|
| Small | from 1 | no |
| Medium | from 5 | yes |
| Large | from 20 | yes |

Thresholds are set **in the currencies themselves**, with no exchange rates: a donation is
compared against the threshold in the same currency it arrived in. `default` covers
currencies that are not in the list. If there is no threshold for the donor's currency but
DonationAlerts converted the amount itself (`amount_in_user_currency`), the converted amount
in the base currency is what gets compared.

**Every tier is enabled per platform.** If DonationAlerts already shows its own alerts and
you would rather not duplicate them, switch those tiers off there, and only Donatello
donations will be shown.

A tier switched off for a platform is skipped entirely: a donation from it drops to a lower
tier that is enabled instead of silently vanishing. A 75 USD donation from Donatello with
the large tier disabled for it shows up as medium.

Tiers, thresholds, names and durations are edited in the panel; a tier can be left with no
platform enabled at all, and then it simply never fires.

#### GIFs, sounds and the theme per tier

Every tier has its own look: the card **theme** (the same four as the other overlays),
**GIFs** and **sounds**. You can pick as many files as you like — every donation takes a
random pair, and the same one never comes up twice in a row: over a stream one and the same
cat gets old.

Files are added in the panel (Alert files → Add a GIF / Add a sound) and live in the `media`
folder inside the data folder. A GIF can be any image a browser understands (`gif`, `png`,
`jpg`, `webp`, `avif`); a sound can be `mp3`, `ogg`, `wav`, `m4a`, `opus` or `flac`. The
per-file cap is 25 MB.

A file that is picked for a tier and later deleted from the folder simply stops coming up:
there will be no broken image in the frame. To delete a file for good, use the cross in the
list; it disappears from the tiers by itself.

**Volume** is shared, on a slider in the panel.

**A shared sound for every alert** is still supported: `public/alert.mp3` plays on tiers
that have no sounds of their own. Without that file the alert is silent.

#### Message voice-over

The donor's message can be read aloud. It works the way DonationAlerts does it: the
synthesis is done by the server, not the browser, and the overlay receives a link to the
finished audio. There are two engines, switched in the panel:

| Engine | What is good | What is not |
|---|---|---|
| **Windows voice** | free, offline, nothing to set up | sounds robotic; needs a voice for the language |
| **ElevenLabs** | a lifelike voice | needs a key and has quotas; the free plan is non-commercial |

Only tiers with **Read the message** ticked are read aloud. Links are stripped from the
message and the length is capped (200 characters by default): with the cloud engine that is
real money, with the offline voice it is a minute of reading aloud. The donor's name is read
before the message if that is enabled.

The alert does not depend on the voice-over: if nothing was synthesized the donation is still
shown, silently, and the reason goes to the log. If the message runs longer than the card
stays up, the card waits for the reading to finish: pulling it out from under the voice
would leave the viewer listening to something no longer on screen.

**The Windows voice.** Tick the box, press Refresh voices, and the list fills with whatever
the system has. There is a trap here worth checking before you go live: **a voice reads only
its own language**. An English voice does not complain about a Russian message, it silently
produces nothing — so the panel warns you when there is no voice for your language, and the
server writes "the voice did not read the text" to the log instead of pretending everything
is fine. Voices are installed in Windows: Settings → Time & language → Speech → Manage
voices → Add voices. One caveat: the list shows SAPI5 voices, and if the system installs only
the newer OneCore variant, the voice will appear for Narrator but not here — installing the
full language with its speech components helps.

Speech rate is a slider, from -10 to 10.

**ElevenLabs.** You need a key from your dashboard and a voice. The key needs permissions for
voices, synthesis and the profile: otherwise it is refused, and that is **not** the same as a
wrong key — the panel shows the ElevenLabs answer as it is, so you can see which permission is
missing. The voice is picked from your account list, or its id can be typed by hand. The
remaining quota is shown right there: how many characters are spent and roughly how many
messages that is.

About their pricing: the free plan gives 10,000 credits a month, the `eleven_flash_v2_5` model
costs 0.5 credits per character (roughly 200 messages of 100 characters),
`eleven_multilingual_v2` costs 1. But the free plan is **non-commercial**, requires crediting
`elevenlabs.io` in the title of anything you publish, and does not allow library voices through
the API — a stream that takes donations needs a paid plan, from $6 a month. That call belongs
to whoever owns the key.

The key is stored in `config.json` in plain text, just like the donation widget links. It is
never sent back to the panel: the field is empty after a reload, with a note next to it saying
the key is on the server.

### Screamers

**Off by default** — they are switched on with a tick in the panel: this is the sort of thing
you enable deliberately rather than discover live on air. Anyone who has already enabled them
keeps their own setting.

On a tier with screamers enabled the overlay plays a random effect out of seven variations (a
lunge at the camera, a quick cut, a strobe, a flashlight, blood on the lens, VHS noise, a slow
reveal) with a random image and sound from its own set.

The variations differ in strength and are matched to the tier: the quick cut and the tape noise
go to small and medium donations, the lunge, the strobe and the blood only to large ones. The
same one never comes up twice in a row.

**A check that does not scare anyone.** One of the variations is `heart` — a big heart instead
of a face, with a soft chime instead of a scream. It tells you the overlay is alive, in the
right place and at the right opacity, and testing that before a stream while flinching every
time is impossible. Pick it in the panel or use `/screamer?variant=heart`. It never comes up on
a real donation: it is excluded from the random pick.

A hand-picked variation is shown on its own, past tiers and thresholds — otherwise a heart with
a one-dollar amount would show nothing, because the small tier does not call a screamer.

The "game coverage" slider sets the opacity — a screamer does not cover the picture completely.
The value can also be tuned in the address: `/screamer?opacity=0.6`.

The media lives in `public/screamers`: photos from Pexels (the license allows commercial use
without attribution) run through color grading, and CC0 sounds from Freesound. Resident Evil
assets are deliberately not used — they belong to Capcom and attract content claims on stream.

Screamers on **your own** screen, not just the viewers', come from the second application
window; see [desktop/README.md](desktop/README.md).

### Now playing

The current track and artist as a card in the corner of the scene, with cover art and equalizer
bars. No music, no card: an empty "nothing is playing" should not hang around for half a stream.

Where the track comes from is a choice in the panel:

- **The Windows media session** (default). The same source the volume popup uses to know what is
  playing: Spotify, a video in a browser tab, AIMP, foobar2000. The player has already told the
  system the title — **there is nothing to set up in it**.
- **A text file** written by the player itself, for players that do not report to the media
  session. foobar2000, AIMP and Snip can do that. The format: one line of "Artist — Title", or
  two lines where the first is the title and the second the artist. An empty file means silence.

**The app filter** matters when more than the player is making sound. A streamer may have a video
or their own broadcast open in a browser, and the media session will happily show its title. Put
a piece of the app name into the filter (`Spotify`), and the rest stops reaching the frame; the
panel lists the apps the system can see right now.

**Cover art.** Spotify does not hand out its own: in the media session it lives as a stream that
cannot be read, and the Web API needs authorization. So the image is looked up by artist, title
and album in open catalogs — iTunes first, then Deezer, with no keys and no sign-up. Spotify names
the album precisely, and that is what picks the right edition out of the results instead of the
first compilation that matches. Usually it is the same image you see in the player; for live
albums and remixes the catalog sometimes returns a different edition. Nothing found — the overlay
shows the track without a picture. Only the track name leaves your machine: no donations and no
viewers are in those requests, and the "Show cover art" tick switches them off entirely.

A long title is not cut off, it scrolls — the speed is set in the panel and can be tuned live with
`/track?speed=80`. When paused the overlay hides by default; if you keep it visible, the equalizer
bars freeze, and that is obvious at a glance.

The "Show a demo track" button is for placing the source in OBS without waiting for the song to
change: the demo stays until a real track replaces it.

The media session is polled by a small PowerShell script (`src/nowplaying/session.ps1`) — there is
no way from Node into WinRT otherwise. It runs as a single process next to the server and exits
with it. On non-Windows systems there is no media session at all: the file source remains.

## Debug addresses

| Address | What it does |
|---|---|
| `/goal?theme=neon` | override the goal overlay theme without touching the settings |
| `/top?theme=neon` | the same for the top donors |
| `/top?demo` | show a sample top, expecting nothing from the server |
| `/recent?theme=neon` | the same for the recent donations feed |
| `/recent?demo` | show a sample ticker, expecting nothing from the server |
| `/recent?speed=120` | tune the ticker speed live |
| `/poll?demo` | show a sample poll, expecting nothing from the server |
| `/poll?theme=neon` | override the poll theme without touching the settings |
| `/track?demo` | show a sample track card, expecting nothing from the server |
| `/track?theme=neon` | the same for the now playing overlay |
| `/track?speed=80` | tune the scrolling title speed live |
| `/alerts?demo` | show a sample alert, expecting nothing from the server |
| `/alerts?theme=neon` | override the alert theme without touching the tier settings |
| `/screamer?variant=heart` | the heart: a check that does not scare anyone |
| `/screamer?demo` | run through every screamer variation |
| `/screamer?variant=lunge` | always show one specific variation |
| `/screamer?ping` | flash a marker on connect — check that the overlay is alive |
| `/screamer?opacity=0.6` | tune the coverage live |

## Development

```bash
npm ci
npm start            # the server on http://localhost:3777
npm run mock         # a fake AxelChat on 8356, for testing without the real one
npm test             # tests
```

Running from source keeps its data in the repository root, not in the profile: starting the
development build must not touch the data of a live stream.

The code is commented in Russian — that is the language the project is developed in.

## License

MIT.
