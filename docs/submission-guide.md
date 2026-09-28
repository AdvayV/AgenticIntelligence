# Submission handoff for CodeStrata

Team: CodeStrata — Advay Vivek (24BCT0136) and Kaavish Gogia (24BCT0103), Vellore Institute of Technology. Repository: https://github.com/AdvayV/AgenticIntelligence. Verify the portal's exact deadline and any organizer update; the team reported roughly one day remaining on 28 September 2026.

## Files already prepared

| Item | File or location | Final action |
|---|---|---|
| Source and reproducible setup | Repository main branch and [README](../README.md) | Confirm latest CI is green. |
| Presentation | [Editable 12-slide deck](CodeStrata-Submission-Draft.pptx) | Add the actual video URL on slide 5, then export final PDF if the portal accepts it. |
| MTEB result | [Current official AppsRetrieval JSON](results/appsretrieval_results.json) | If the selected code encoder completes and scores better, use its separately generated official JSON and update the deck before submission. |
| Demonstration | [Five-minute narration plan](demo-script.md) | Record and upload a video shorter than five minutes; share the viewing URL. |
| AI disclosure | [Filled draft](CodeStrata-AI-Disclosure-Draft.docx) | Review, enter the actual submission date, and sign. Keep the signed copy private unless the portal explicitly requires a public link. |
| Evaluation details | [Validation report](validation.md) and [raw artifacts](results/) | Distinguish synthetic, real-repository, and official scores in narration. |

## Record the demo

1. From the repository run `npm ci --omit=optional`, `npm test`, then `npm start` (use `npm.cmd` on Windows PowerShell if needed). Open http://127.0.0.1:3000.
2. Record at 1080p or higher with a readable browser zoom. Use the [timed narration](demo-script.md). Click **Investigate the refactor**, show the v1/v2/v3 timeline, current and counterexample source, imported `policyCheck`, and the agent trace.
3. State that the missing direct `await` is a static pattern rather than proof of a runtime race. Show the official result candidly.
4. Stop before five minutes. Export MP4, upload to YouTube as unlisted or to Drive with viewing access enabled. Open the link in a signed-out/incognito browser to confirm it works.
5. Replace `[TEAM TO ADD AFTER RECORDING]` on slide 5 with that exact URL. Export a PDF from PowerPoint/LibreOffice after checking the slide is still readable.

## Complete and submit

1. Read the entire AI disclosure draft. Confirm its statements are accurate, add the actual submission date, and have the team representative sign it. Submit that signed file through the organizer's required channel; a public GitHub commit of a handwritten signature is unnecessary.
2. Confirm the final deck, video link, repository, and selected MTEB JSON all point to the same commit/result. Keep the official MTEB JSON unmodified.
3. Upload the files and links the portal requests. The original theme guidelines favor the MTEB-generated JSON; do not substitute the synthetic benchmark JSON.
4. Create the prescribed `PRISM_GENAI_HACKATHON_Y2026` release/tag only when the video URL and all required assets are ready. Attach the official JSON to that release.

The prepared deck and disclosure intentionally retain the video and signature placeholders. Those require an actual team action and must not be presented as completed.
