# Interaction Prompts

The following prompts were used during the performance investigation of the
`Events-system` project. They include both commands run in the shell and
questions asked to the AI assistant.  This document serves as a reference for
reproducing the tests and understanding the reasoning flow.

## Initial Performance Investigation

1. "Great news — zero failures, 100/100 success. That's the most important
	requirement passed ✅ The latency issue (214ms–602ms instead of <150ms) is
	completely normal and fixable. Let me explain why it's happening and how to
	fix it. ... make all of these steps into my project"

2. "why this still not meet expectation ? node scripts/load-test.js"

3. "make steps that you do to improve that to 41% and run test e after that"

4. "no i don't want that" (declined Test C)

5. "ok test b"

6. "A" (choose in-container test)

7. "C" (declined; not executed)

8. "make all tries we make into file to make it into assessment + the final
	summary"

9. "make summary with prompots that i use PROMPOTS.md"

---

### Shell commands used during experiments

Shell commands executed in Powershell and bash are recorded in
`PERFORMANCE_ASSESSMENT.md` and above sections.  Key commands include:

```sh
docker compose up --build -d
node scripts/load-test.js
docker exec fincart_app node -e "..."
cmd /c "set REDIS_HOST=127.0.0.1&& ... node src/app.js"
``` 

All commands are available verbatim in the assessment file for copy/paste.

---

This file is kept up to date during performance debugging to capture both the
conversational prompts and the functional commands used, providing transparency
for future reference.

