# Project File Structure

```text
.
├── .gitignore
├── .verify-structured-cards-ok
├── AUDIT_FOR_STUDY.md
├── backend/
│   ├── agent/
│   │   ├── agent.zip
│   │   ├── agentRuntime.js
│   │   ├── agentTypes.js
│   │   ├── auditStore.js
│   │   ├── confirmationStore.js
│   │   ├── iterationBudget.js
│   │   ├── planStore.js
│   │   ├── promptPolicy.js
│   │   ├── runAgentTurn.js
│   │   └── toolGatekeeper.js
│   ├── ai/
│   │   ├── coding/
│   │   │   ├── codeIntelligence.js
│   │   │   ├── codeVerifier.js
│   │   │   └── projectContextScanner.js
│   │   ├── context/
│   │   │   ├── contextPacker.js
│   │   │   └── contextWindowManager.js
│   │   ├── modelRouter.js
│   │   ├── promptBuilder.js
│   │   ├── providerAgentAdapter.js
│   │   ├── reasoning/
│   │   │   ├── calculator.js
│   │   │   ├── clarificationPolicy.js
│   │   │   ├── exemplarLibrary.js
│   │   │   ├── qualityEvaluator.js
│   │   │   ├── reasoningController.js
│   │   │   ├── reasoningPolicy.js
│   │   │   ├── reasoningPrompt.js
│   │   │   ├── reasoningSummaryBuilder.js
│   │   │   └── taskClassifier.js
│   │   ├── responseReviewer.js
│   │   └── streamResponseCollector.js
│   ├── browser/
│   │   ├── browserActions.js
│   │   ├── browserEventStreamer.js
│   │   ├── browserObserver.js
│   │   ├── browserRunStore.js
│   │   ├── browserSafety.js
│   │   ├── browserSessionManager.js
│   │   └── browserTool.js
│   ├── empathy/
│   │   ├── emotionDetector.js
│   │   ├── empathy.zip
│   │   ├── empathyPolicy.js
│   │   ├── humanEmotionalSupport.js
│   │   ├── intensityDetector.js
│   │   ├── intentDetector.js
│   │   ├── messageClassifier.js
│   │   ├── responsePlanner.js
│   │   ├── safetyDetector.js
│   │   ├── testLogic.js
│   │   └── toneProfiles.js
│   ├── memory/
│   │   ├── conversationSummary.js
│   │   ├── memoryExtractor.js
│   │   ├── memoryManager.js
│   │   ├── memoryOrchestrator.js
│   │   └── userProfileStore.js
│   ├── orchestrator.js
│   ├── package-lock.json
│   ├── package.json
│   ├── rag/
│   │   ├── chunker.js
│   │   ├── citations.js
│   │   ├── documentIngestion.js
│   │   ├── embeddingService.js
│   │   └── vectorSearch.js
│   ├── requirements.txt
│   ├── security/
│   │   ├── jsonSchemaValidator.js
│   │   ├── rateLimiter.js
│   │   └── secretVault.js
│   ├── server.js
│   ├── server.py
│   ├── stats/
│   │   └── usageStats.js
│   ├── storage/
│   │   └── hazyDatabase.js
│   ├── tests/
│   │   ├── agentOrchestration.test.js
│   │   ├── browserAutomation.test.js
│   │   ├── codeIntelligence.test.js
│   │   ├── codeVerifier.test.js
│   │   ├── companionBehavior.test.js
│   │   ├── contextPacker.test.js
│   │   ├── contextWindowManager.test.js
│   │   ├── memoryPersistence.test.js
│   │   ├── orchestratorReasoning.test.js
│   │   ├── projectContextScanner.test.js
│   │   ├── promptBuilder.test.js
│   │   ├── providerAgentAdapter.test.js
│   │   ├── ragPipeline.test.js
│   │   ├── reasoningController.test.js
│   │   ├── reasoningSummaryBuilder.test.js
│   │   ├── reasoningTaskPipeline.test.js
│   │   ├── responseReviewer.test.js
│   │   ├── secretVault.test.js
│   │   ├── server_hazy_tts.test.js
│   │   ├── toolExecutor.test.js
│   │   ├── toolRegistry.test.js
│   │   ├── toolRouter.test.js
│   │   └── webSearchTool.test.js
│   ├── tools/
│   │   ├── artifactTool.js
│   │   ├── calculatorTool.js
│   │   ├── codeTool.js
│   │   ├── fsTool.js
│   │   ├── ragSearchTool.js
│   │   ├── toolExecutor.js
│   │   ├── toolRegistry.js
│   │   ├── toolRouter.js
│   │   └── webSearchTool.js
│   └── webSearch/
│       ├── chunker.js
│       ├── citationBuilder.js
│       ├── contentExtractor.js
│       ├── contextBuilder.js
│       ├── pageFetcher.js
│       ├── queryPlanner.js
│       ├── reranker.js
│       ├── resultFilter.js
│       ├── searchProviders.js
│       ├── searchRouter.js
│       ├── searchRunStore.js
│       ├── sourceQuality.js
│       ├── webSearch.zip
│       └── webSearchService.js
├── backup/
│   ├── codex-test-attachment.txt
│   ├── enhancements.js
│   ├── hazy-auto-continue-integration.js
│   ├── hazy-auto-continue.js
│   ├── hazy-web-logic-integration.js
│   └── quick-prompts.js
├── check-system.bat
├── check-system.sh
├── config/
│   └── hazy-config.json
├── controller-requirements.txt
├── docx/
│   ├── Chat_Flow_Structure_Gap_Analysis.doc
│   ├── Chat_Flow_Structure_Gap_Analysis_Detailed.doc
│   ├── Hazy_AI_Codebase_Analysis_Report.docx
│   ├── Problem_Files.zip
│   ├── app.js
│   ├── hazy_kokoro_refactor_plan (1).md
│   ├── orchestrator.js
│   └── server.js
├── frontend/
│   ├── app.js
│   ├── assets/
│   │   └── logos/
│   │       ├── hazy_logo_cream_transparent.svg
│   │       ├── hazy_logo_ink_transparent.svg
│   │       ├── hazy_logo_oled_transparent.svg
│   │       └── hazy_logo_warm_transparent.svg
│   ├── audioQueueManager.js
│   ├── enhancements.css
│   ├── hazy-agent.css
│   ├── hazy-agent.js
│   ├── hazy-auto-continue.css
│   ├── hazy-enhancements-complete.js
│   ├── hazy-rag.css
│   ├── hazy-rag.js
│   ├── hazy-web-logic-integration.js
│   ├── index-backup.html
│   ├── index.html
│   ├── model-manager.html
│   ├── novel-writer.html
│   ├── quick-prompts.css
│   ├── streamingTTSController.js
│   ├── style.css
│   ├── ttsManager.js
│   ├── ui-integration.js
│   ├── vendor/
│   ├── voiceSettingsStore.js
│   └── voices.json
├── generate_doc.js
├── hazy_controller.py
├── kokoro/
│   ├── .github/
│   │   └── FUNDING.yml
│   ├── .gitignore
│   ├── LICENSE
│   ├── README.md
│   ├── demo/
│   │   ├── README.md
│   │   ├── app.py
│   │   ├── en.txt
│   │   ├── frankenstein5k.md
│   │   ├── gatsby5k.md
│   │   ├── packages.txt
│   │   └── requirements.txt
│   ├── examples/
│   │   ├── device_examples.py
│   │   ├── export.py
│   │   ├── make_triton_compatible.py
│   │   └── phoneme_example.py
│   ├── kokoro/
│   │   ├── __init__.py
│   │   ├── __main__.py
│   │   ├── custom_stft.py
│   │   ├── istftnet.py
│   │   ├── model.py
│   │   ├── modules.py
│   │   └── pipeline.py
│   ├── kokoro.js/
│   │   ├── .gitignore
│   │   ├── .prettierignore
│   │   ├── README.md
│   │   ├── demo/
│   │   │   ├── .gitignore
│   │   │   ├── README.md
│   │   │   ├── eslint.config.js
│   │   │   ├── index.html
│   │   │   ├── package-lock.json
│   │   │   ├── package.json
│   │   │   ├── postcss.config.js
│   │   │   ├── public/
│   │   │   │   ├── hf-logo.svg
│   │   │   │   └── wave.svg
│   │   │   ├── src/
│   │   │   │   ├── App.jsx
│   │   │   │   ├── index.css
│   │   │   │   ├── main.jsx
│   │   │   │   ├── utils.js
│   │   │   │   └── worker.js
│   │   │   ├── tailwind.config.js
│   │   │   └── vite.config.js
│   │   ├── package-lock.json
│   │   ├── package.json
│   │   ├── rollup.config.js
│   │   ├── src/
│   │   │   ├── kokoro.js
│   │   │   ├── phonemize.js
│   │   │   ├── splitter.js
│   │   │   └── voices.js
│   │   ├── tests/
│   │   │   ├── phonemize.test.js
│   │   │   └── splitting.test.js
│   │   ├── tsconfig.json
│   │   └── voices/
│   │       ├── af_alloy.bin
│   │       ├── af_aoede.bin
│   │       ├── af_bella.bin
│   │       ├── af_heart.bin
│   │       ├── af_jessica.bin
│   │       ├── af_kore.bin
│   │       ├── af_nicole.bin
│   │       ├── af_nova.bin
│   │       ├── af_river.bin
│   │       ├── af_sarah.bin
│   │       ├── af_sky.bin
│   │       ├── am_adam.bin
│   │       ├── am_echo.bin
│   │       ├── am_eric.bin
│   │       ├── am_fenrir.bin
│   │       ├── am_liam.bin
│   │       ├── am_michael.bin
│   │       ├── am_onyx.bin
│   │       ├── am_puck.bin
│   │       ├── am_santa.bin
│   │       ├── bf_alice.bin
│   │       ├── bf_emma.bin
│   │       ├── bf_isabella.bin
│   │       ├── bf_lily.bin
│   │       ├── bm_daniel.bin
│   │       ├── bm_fable.bin
│   │       ├── bm_george.bin
│   │       ├── bm_lewis.bin
│   │       ├── ef_dora.bin
│   │       ├── em_alex.bin
│   │       ├── em_santa.bin
│   │       ├── ff_siwis.bin
│   │       ├── hf_alpha.bin
│   │       ├── hf_beta.bin
│   │       ├── hm_omega.bin
│   │       ├── hm_psi.bin
│   │       ├── if_sara.bin
│   │       ├── im_nicola.bin
│   │       ├── jf_alpha.bin
│   │       ├── jf_gongitsune.bin
│   │       ├── jf_nezumi.bin
│   │       ├── jf_tebukuro.bin
│   │       ├── jm_kumo.bin
│   │       ├── pf_dora.bin
│   │       ├── pm_alex.bin
│   │       ├── pm_santa.bin
│   │       ├── zf_xiaobei.bin
│   │       ├── zf_xiaoni.bin
│   │       ├── zf_xiaoxiao.bin
│   │       ├── zf_xiaoyi.bin
│   │       ├── zm_yunjian.bin
│   │       ├── zm_yunxi.bin
│   │       ├── zm_yunxia.bin
│   │       └── zm_yunyang.bin
│   ├── pyproject.toml
│   ├── tests/
│   │   └── test_custom_stft.py
│   └── uv.lock
├── kokoro_server.py
├── start-controller.bat
├── start.bat
├── start.sh
├── temp_report_generation/
│   └── generate_report.py
├── test-verify-structured-cards.js
├── tests/
│   └── test_hazy_controller.py
└── tools/
```
