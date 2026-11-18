# Update notices — shown on every user's shelf

Anything you write in this file (after the marker line) appears as a banner at the
top of every user's shelf, with the update command and a copy button.

To tell all users a lab has updated: edit this file, push to main, done — every
shelf picks it up within 5 minutes (no action needed on their machine until they
choose to update).

To clear the notice: empty the file (or delete everything after the marker) and push.

<!-- SHELF NOTICE BELOW — text after this marker is shown to users -->

New lab: pf-agent-client-sync-lab — PingFederate 13.1 AI-agent clients synced into PingIDM agent records. Re-run the update to pick it up.

**Version 3.0 (major)** — setup is now four inputs and one command: your admin environment ID, worker client ID/secret and region, passed right in the install line — the demo environment and apps are created for you. Setup also prints the P1AZ policy import steps. If you have the labs already, re-run `scripts/setup.sh setup` with the same command's credentials to pick this up. Run the update command below first, then re-run setup.
