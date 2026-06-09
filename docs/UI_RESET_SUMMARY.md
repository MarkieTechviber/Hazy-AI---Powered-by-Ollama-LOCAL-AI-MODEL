# Hazy Full UI Rebuild

The previous active dashboard/reset shell has been replaced with a fresh interface built around the reference layout:

- wide left sidebar with brand, new chat, clear chat, search, recent chats, model, settings, persona, and privacy status
- clean top bar with mobile menu, compact brand, online status, settings, and account/more trigger
- centered Hazy hero with aligned starter actions
- composer anchored below the main canvas with Chat / Build Website / Build Code modes
- builder output as a contextual panel, not a permanent rail
- warm cream/gold palette preserved
- no overlapping dashboard boxes or right-rail clutter on the default screen

The JavaScript DOM contract from `frontend/app.js` is preserved, including the chat, settings, model, training, persona, TTS, file upload, and builder IDs.
