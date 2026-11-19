# Update notices — shown on every user's shelf

Anything you write in this file (after the marker line) appears as a banner at the
top of every user's shelf, with the update command and a copy button.

To tell all users a lab has updated: edit this file, push to main, done — every
shelf picks it up within 5 minutes (no action needed on their machine until they
choose to update).

To clear the notice: empty the file (or delete everything after the marker) and push.

<!-- SHELF NOTICE BELOW — text after this marker is shown to users -->

New lab: intent-console-lab-LAB — the Privilege console's AI Intents page as a standalone simulation (D134, port 7825). Run the update command below, then start it from the shelf.

Two new labs: wimse-lab-LAB (IETF WIMSE mock: trust domains, WIT/WPT, multi-hop chain) and workload-cert-lab-LAB (X.509/SPIFFE workload identity, mTLS walkthrough). Run the update command below, then start them from the shelf.


Updated Authorize policy (version 3.2) — adds the airline booking rules. Run the update, then re-import `policy/ai-demo-p1az.standalone.snapshot.json` in PingOne Authorize -> Trust Framework -> Import (live Authorize only; mock needs nothing).

New lab: pf-agent-client-sync-lab — PingFederate 13.1 AI-agent clients synced into PingIDM agent records. Re-run the update to pick it up.

**Version 3.0 (major)** — setup is now four inputs and one command: your admin environment ID, worker client ID/secret and region, passed right in the install line — the demo environment and apps are created for you. Setup also prints the P1AZ policy import steps. If you have the labs already, re-run `scripts/setup.sh setup` with the same command's credentials to pick this up. Run the update command below first, then re-run setup.
