# Human listener participant study

The current participant site is **`docs/`**, a standalone static website for GitHub Pages. Navigation runs in the browser; DataPipe receives the data and sends it to the storage destination configured on the experiment dashboard. The previous Python-server prototype remains in `server.py` and `static/` for reference and is not used by the new site.

## Preview locally

From this folder:

```sh
python3.11 -m http.server 8767 --bind 127.0.0.1 --directory docs
```

Open **http://127.0.0.1:8767/?preview=1**. Preview mode never opens a DataPipe session, uploads data, or offers a Prolific completion link. A URL without `PROLIFIC_PID` also defaults to preview. Use a private browser window for a fresh preview; a regular reload preserves progress.

## GitHub Pages deployment

This folder has its own Git repository, with origin `https://github.com/HannahGuan/navigation_participantUI.git`. The parent navigation_llm repository ignores it.

1. Commit and push this repository, including `docs/` and its generated `stimuli.json`.
2. In the repository's Settings → Pages, select **Deploy from a branch**, your branch, and **`/docs`**.
3. After Pages reports a successful deployment, preview at `https://hannahguan.github.io/navigation_participantUI/?preview=1`.
4. Use this external study URL in Prolific, with URL parameter recording enabled:

```text
https://hannahguan.github.io/navigation_participantUI/?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}
```

The above address is the expected deployment URL; this development pass has not pushed or enabled Pages. Relative asset paths support the repository subdirectory. Only publish `docs/`, never participant data.

## Current settings

`docs/config.js` contains:

- DataPipe experiment ID: `elWePWHpMmnZ`.
- Prolific completion URL: `https://app.prolific.com/submissions/complete?cc=CSQGOE1Y`.
- Version, collection toggle, maximum actions, and optional explicit condition definitions.

At the researcher's request, the existing five cases are retained pending a later redesign: fence/no directions, fence/suitable directions, lake/no directions, lake/suitable detour, lake/swimmer directions. All currently use `P_jump` (jump enabled, swim/lava immunity disabled), radius-2 visibility, and no prior map knowledge. Order is independently randomized per session and is preserved across reloads. Instructions remain visible, but old map cells do not. These are five instruction/map cases, not the five capability profiles in capacity_pilot.

Ability text is generated from the actual profile for each trial. The compiled bundle supports all five source profiles and nine maps, so future condition assignments can change without rewriting movement. `fov_radius: null` gives full visibility; `prior_knowledge: 'all'` shows the whole map initially. Update the welcome visibility copy if the study design changes, and bump `studyVersion` before collecting a new version. Repeated maps can produce carryover learning; randomization does not remove it.

## DataPipe setup and save behavior

On the DataPipe dashboard, connect/select your Google Drive destination and enable **Accept new data**. Leave capacity for your pilot plus any deliberately submitted live tests. The final payload is a JSON array of five `trial_type: "navigation"` records. If validation is enabled, its required fields must match these records (for example `trial_type`, `session_id`, and `participant_id`); do not require unrelated jsPsych fields.

- Every move is saved in browser localStorage. An exclusive browser lock prevents the same session running in two tabs.
- Compact action batches are staged with the pinned official DataPipe client every 10 moves or 10 seconds, and at trial end. Final files include the entire trajectory, regardless of staging availability.
- DataPipe staging is best-effort; a disconnected browser still collects locally. Closing the tab can leave a partial session. Do not promise participants that closing the tab deletes their data.
- Reload resumes the same trial/order and logs a resume event. It opens a new staging segment and replays the compact event history. DataPipe may therefore produce multiple partial files for one application session. Deduplicate by `session_id`, trial index and action step; prefer a confirmed final file. Do not count partial files as additional participants.
- At completion the exact final JSON is frozen and given a UUID + SHA-256 filename. Retries reuse those exact bytes and filename. A duplicate response for that content-addressed filename is treated as confirmation of the previous upload.
- HTTP 201 means stored. HTTP 202 means accepted into DataPipe's durable retry queue; this also unlocks completion. It does not prove the file has already reached Google Drive.
- Rejected uploads keep the return link hidden, display a retry option, and retain a downloadable backup. No redirect happens merely because an upload was attempted.
- No passwords or storage credentials are embedded in the site. The DataPipe experiment ID and Prolific completion code are necessarily visible in this static website.

A live synthetic upload on 2026-09-27 reached DataPipe but was rejected with HTTP 400 / `DATA_COLLECTION_NOT_ACTIVE`. No QA file was accepted. Enable **Accept new data** on the experiment dashboard, then repeat the upload check. Before recruitment, use Prolific's preview, verify the test file appears in the configured Drive folder, and confirm the completion path. Automated and browser QA used local or mocked saving.

DataPipe references: [client](https://github.com/jspsych/datapipe/tree/main/packages/client), [API](https://pipe.jspsych.org/docs/api), [incremental saving](https://pipe.jspsych.org/docs/experiments/streaming).

## Data and analysis

Final files contain one row per navigation trial, including participant/study/Prolific-session IDs, application session ID, study version, randomized order, exact condition/instruction/capabilities, source hashes, timestamped actions (including blocked moves and jumps), trajectory, success, action count, optimal-action reference, efficiency on successful trials, coverage, and first goal visibility. Browser visibility and reload events are also recorded. Current observations can be reconstructed from the versioned map snapshot, trial configuration and trajectory; they are not duplicated in every action row.

Browser response times use `performance.now()` between moves and include idle/hidden time; after refresh the interval restarts and the resume is logged. Wall-clock elapsed times include reloads. These are navigation timings, not calibrated psychophysical reaction times.

Download final JSON files from Drive, then export flat CSVs:

```sh
python3.11 scripts/export_csv.py data/*.json --out data/analysis
```

The exporter writes `trials.csv` and `actions.csv`, skips `.partial.json` files, and deduplicates final/backup copies by application session and trial. Keep the original JSON and the collected version of `docs/stimuli.json` for reproducibility. Local browser backups are not automatically erased on completion.

## Folder structure and validation

- `docs/`: complete publishable site, configuration, navigation engine, upload adapter, generated stimuli and pinned DataPipe client.
- `scripts/build_stimuli.py`: compiles exact movement outcomes from the existing Python sandbox and records source hashes. Requires the adjacent navigation_llm source tree only when rebuilding.
- `scripts/check_parity.py`: reads current Python source for independent movement checks.
- `scripts/export_csv.py`: standard-library analysis export; works standalone.
- `tests/`: offline Node tests for navigation and mocked collection responses.
- `server.py`, `static/`, `test_server.py`: previous local Python-server prototype; not the deployed implementation.
- `data/`: local researcher data, Git-ignored.

```sh
python3.11 scripts/build_stimuli.py
npm test
node --check docs/app.js
```

Ten tests passed, including the full five-trial frontend flow with a rejected upload followed by a successful retry: 40,500 movement outcomes across 9 maps × 5 profiles, optimal paths for all 45 combinations, visibility, capability differences, action limits, randomization, immutable retries, 201/202 handling, rejected/network-failed uploads, preview isolation and staging size guards. Chrome QA verified the rendered trial, keyboard movement, refresh recovery and a 10-action successful fence route. Full live DataPipe → Drive → Prolific verification remains pending.

A static site contains map data in downloadable assets even when terrain is visually hidden. It does not enforce hidden information against deliberate developer-tools inspection.
