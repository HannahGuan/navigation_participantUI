# Human listener participant study

The current site is **`docs/`**: a standalone GitHub Pages experiment. Each participant completes **one condition**, then data is saved to DataPipe and the Prolific return button becomes available. The planned pilot is 15 participants, targeting 3 per condition, with an estimated duration of 3 minutes and no time cutoff.

## Current conditions and assignment

| DataPipe index | Condition | Map |
| --- | --- | --- |
| 0 | No directions | fence1 |
| 1 | Suitable fence directions | fence1 |
| 2 | No directions | lake1 |
| 3 | Suitable lake detour | lake1 |
| 4 | Incompatible swimmer directions | lake1 |

All five currently use `P_jump`: jumping enabled, swimming and lava immunity disabled, radius-2 visibility, no prior map knowledge. Directions remain visible; old map cells become hidden. Movement is compiled directly from the existing Python sandbox.

Live entry calls DataPipe's `getCondition` **once**, saves the returned assignment locally, and starts only that condition. Reloading resumes the same assignment and trajectory. Participant IDs are read automatically from the Prolific URL; no ID entry or session-download controls are displayed. Opening the bare URL starts **researcher test mode**: a first-page badge explains saving and expands to show the Prolific participant-entry URL. Researcher runs upload trajectory and timing through DataPipe, have TEST filenames and `is_test: true`, and do not consume participant assignments or offer Prolific completion. The CSV exporter excludes these runs by default; use `--include-tests` to inspect them. Complete Prolific URL identifiers enter participant mode without a researcher badge. Partial or unresolved identifiers show an entry error. Browser backups remain internal. Explicit preview never requests a live assignment or uploads data; `?preview=1&condition=0` through `condition=4` selects a preview case.

DataPipe cycles through 0–4. Fifteen uninterrupted assignments give three starts per condition, not necessarily three completed submissions: dropout, a lost assignment response, a cleared browser, or switching devices can affect the count. This is balanced rotation rather than independent random assignment. Do not describe it as guaranteed randomization or an enforced completion quota. A failed assignment request stops before the participant sees a map; no random fallback is used.

## Local researcher testing and preview

```sh
python3.11 -m http.server 8767 --bind 127.0.0.1 --directory docs
```

Open http://127.0.0.1:8767/ for a researcher test that uploads data. Use `?condition=1` to choose a case, and the completion screen’s **Start another test** button for a fresh session. For an offline preview, open http://127.0.0.1:8767/?preview=1&condition=1. Use a private browser window for a fresh run; reload preserves progress. Version 3 uses a separate storage key from the former five-trial prototype, leaving its backups untouched. Live local recovery is keyed by study and participant ID; another tab for that participant is blocked while the original tab holds the session lock.

## Deployment and collection setup

This folder has its own repository at `https://github.com/HannahGuan/navigation_participantUI.git`; the parent navigation_llm repository ignores it. Commit and push this folder, then set GitHub Pages to **Deploy from a branch → your branch → /docs**. Relative paths work under the repository subdirectory. These changes have not been pushed or deployed by this development pass.

Use the expected Pages URL in Prolific with all three URL parameters:

```text
https://hannahguan.github.io/navigation_participantUI/?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}
```

`docs/config.js` contains the existing DataPipe experiment `elWePWHpMmnZ`, completion URL `https://app.prolific.com/submissions/complete?cc=CSQGOE1Y`, version, 400-action limit, and recruitment targets. The targets are documentation/configuration, not a client-enforced recruitment cap. Set 15 places on Prolific. Allow room for deliberately submitted test files if setting a DataPipe submission cap.

On DataPipe:

1. Connect/select the intended Google Drive destination.
2. Enable **Accept new data** (live saving was verified after this was enabled).
3. Enable **condition assignment** with **5 conditions**. The researcher confirmed this configuration, and a live check returned HTTP 200 with condition 0.
4. If validating JSON, match fields present in the payload (for example `trial_type`, `session_id`, `participant_id`), not unrelated jsPsych fields.

A live synthetic storage check returned **HTTP 201 / Success**, meaning DataPipe reported the file stored at the configured provider. Filename: `QA_SYNTHETIC_QA-820f3f68-73d9-4284-acad-9e729f313fb2_single_condition.json`. It is flagged `is_test: true`, is not participant data, and uses no real Prolific ID. It contains one trial, 15 actions, 16 trajectory points, including a blocked move and fence jump. The local copy is `examples/synthetic_session.json`.

After the researcher enabled assignment and set 5 conditions, a live assignment check returned HTTP 200 / `{"message":"Success","condition":0}`. This QA call consumed one assignment; any subsequent uninterrupted block of 15 assignments still cycles three times through all five conditions. The endpoint confirms assignment is active but does not expose the configured condition count; the five-condition setting was confirmed by the researcher. Google Drive was not independently opened to inspect the file. End-to-end published-site browser → DataPipe → Drive → Prolific verification still needs a final preview before recruitment.

## Exactly what is saved

Each final JSON file is an array with **one trial record**. It includes a map snapshot, coordinate convention, condition, capabilities, source hashes, assignment method/index, Prolific identifiers and the following navigation data:

| Field | Meaning |
| --- | --- |
| `trail` | Ordered `[x,y]` positions, including the start and one resulting position per action. Blocked actions repeat the position. |
| `trajectory` | The same ordered positions, each with `step`, ISO `timestamp`, `elapsed_ms`, and movement `result`. Step 0 is the starting position at elapsed time 0. |
| `actions` | Every attempted action: compass direction, `from`, `to`, result (`moved`, `jumped`, `blocked`), blocking reason, timestamp, elapsed time and response interval. |
| `actions[].elapsed_ms` | Time since the trial began, including thinking, hidden-tab time, and logged reload gaps. |
| `actions[].response_ms` | Time since the previous action; for the first action, time since trial start. Reload gaps are included. |
| `duration_ms` | Time from trial start to the terminal action, before network upload. |
| `wall_duration_ms` | Separate wall-clock duration, available for comparison/audit. |
| `instruction_reading_ms` | Time from page initialization to pressing Begin, before the assignment request. Condition-specific directions first appear when the trial begins, so reading those is included in trial time. |
| `assignment_wait_ms` | Time waiting for condition assignment, kept separate from instruction and task time. |
| `browser_events` | Visibility changes and reload/resume events, including the estimated resume gap and whether the wall clock moved backwards. |
| `map_snapshot` | Width, height, terrain, obstacles, start and goal, so the path can be interpreted independently of the current website. |

Coordinates are **zero-based `[x,y]`**: x increases east/right, y increases south/down. A jump is one action and can change position by two cells. All times are milliseconds except ISO date-time strings.

Within a page, timing uses `performance.now()` rather than the adjustable wall clock. After reload, the gap since the last checkpoint is estimated using wall-clock time and explicitly logged. This preserves elapsed/response intervals instead of silently restarting them. Device sleep and system-clock changes across reload can still affect timing. Timestamps are also retained for audit. These are navigation timings, not calibrated psychophysical reaction times.

## Persistence and completion

- Every action is backed up to localStorage. An exclusive browser lock prevents simultaneous use of the same local study session in two tabs.
- Compact batches are staged to DataPipe every 10 actions or 10 seconds, on visibility changes, and when the trial ends. Partial staging is best-effort; the final upload always includes the entire trial.
- Reaching the chest or the 400-action limit automatically ends the single trial and attempts the final upload. No second map is shown.
- A refresh opens a new staging segment and replays the compact record history. Partial files may overlap; deduplicate by application session, trial index and action step. Prefer a final file when it exists.
- Final JSON is frozen before upload, under a UUID + SHA-256 filename. Retries reuse the same bytes and filename. Duplicate-file confirmation for that content-addressed name recovers a previous successful upload with a lost response.
- HTTP 201 confirms stored; HTTP 202 confirms accepted into DataPipe's durable retry queue. Both permit returning to Prolific. A rejected or failed request keeps the completion link hidden and offers retry while retaining the local backup.
- Local backups remain after completion. Closing the page may leave partial data; it is not a data-deletion mechanism.

## CSV export

Download the JSON files from Drive and run:

```sh
python3.11 scripts/export_csv.py data/*.json --out data/analysis
```

Outputs:

- `trials.csv`: assignment, condition, outcome and overall duration.
- `actions.csv`: one row per attempted action, with explicit `from_x`, `from_y`, `to_x`, `to_y`, timestamp and timing columns.
- `trajectory.csv`: one row per occupied position, including step 0, with x/y, timestamp, elapsed time and result.

The exporter skips `.partial.json` files and prefers completed/longer records over duplicate backups. It does not deduplicate different application sessions belonging to the same person; examine Prolific IDs when deciding exclusions. The synthetic example and its three CSV exports are in `examples/`; exclude them from participant analyses.

## Files and checks

- `docs/`: publishable site; `assignment.js`, `engine.js`, `timing.js`, `data.js`, `storage.js`, and `app.js` separate assignment, movement, timing, export and UI.
- `scripts/build_stimuli.py`: compiles 9 maps × 5 profiles from the adjacent Python sandbox. Rebuilding needs the navigation_llm source tree; deployment does not.
- `scripts/check_parity.py`: current-source reference for movement parity tests.
- `scripts/export_csv.py`: standalone standard-library CSV export.
- `tests/`: movement, single-trial flow, assignment, timing, upload-failure and CSV-integrity tests.
- `examples/`: clearly synthetic saved JSON and CSV data.
- `server.py`, `static/`, `test_server.py`: legacy five-trial local prototype, not used for this study.
- `data/`: Git-ignored researcher data.

```sh
npm test
node --check docs/app.js
```

Offline checks cover 40,500 movement outcomes, all 45 optimal routes, one-condition assignment, a simulated 15-start balance, blocked/jump trajectories, timing across reload, rejected saves, retry confirmation and explicit CSV fields. Chrome preview verified refresh recovery and immediate completion after one 10-action fence trial. Live storage and condition assignment both succeeded. The five-condition dashboard setting was confirmed by the researcher; the endpoint returned a valid index of 0.

References: [DataPipe API](https://pipe.jspsych.org/docs/api), [DataPipe client](https://github.com/jspsych/datapipe/tree/main/packages/client). Static assets contain complete map data even when it is visually hidden; developer-tools inspection is not prevented.
