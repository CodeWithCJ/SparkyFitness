# Offline Workouts

The mobile app can run a workout with no connection to your server: in a gym with no signal, while travelling, or while your server is down for an update. The workout is kept on your phone and uploaded once your server can be reached again.

Offline workouts are on iPhone and Android. The website needs a connection.

## Before you go offline

Open the app once while it can reach your server. It then saves what a workout needs on your phone:

- your saved workouts
- your exercise library (names, categories, muscles, equipment and instructions)
- your last-time values, so the previous sets and personal record checks still work
- your workout plans for the next two weeks
- the workouts you logged in the last 7 days, so the Diary can show them
- your units, plates and profile

This refresh runs by itself when the app is open and connected, at most every six hours. You can also start it from **Settings → Offline → Refresh now**, which shows when the last refresh finished.

If you try to start a workout offline before the phone has ever refreshed, the app tells you to connect once first. That rule keeps a workout from being logged in the wrong weight unit.

## What works offline

- Start a saved workout, a workout your plan puts on today, or an empty workout.
- Resume a partial workout from its detail screen.
- Log sets, add or swap exercises from your saved library, use the plate calculator and the rest timer.
- Finish the workout. The usual summary appears, and your feedback and the "update saved workout" answer are kept to send later.
- Discard a workout.
- Delete a saved workout from its detail screen. It disappears from your diary at once and is removed from the server when it can be reached.
- See your workouts of the last 7 days in the **Diary**, and open them. Food, sleep and the other diary entries need a connection, and the diary says so. Older days are not kept on the phone.
- Browse your saved workouts and your exercise library in the **Library** tab. Everything else in the Library (foods, meals, plans, reports) needs a connection, and the tab says so.

- Log a workout after the fact (**Log past workout**, or the **Add workout** form) and edit a workout you already logged. The change is kept on your phone and uploads later, like any other offline workout.

- Log a drink with the **+** button on the Dashboard's water card, or with a quick-add drink. The drink is kept on your phone and uploads later, and the amount shown goes up at once. Each press is uploaded once: if the connection drops while uploading, sending it again does not add a second drink. Taking a drink off (**−**) needs a connection. The water total is the amount your server had at last load plus the drinks waiting, so it is correct after the upload.

These need a connection: deleting past workouts, creating new exercises or saved workouts, online exercise search, suggested alternatives, reports, food logging and the AI assistant.

When the app cannot reach your server, an **Offline** strip shows at the top of the screens that work from saved data. Tap it to check the connection again. Screens that need the server show a **Start a saved workout offline** button.

## Uploading

A workout logged offline shows **Waiting to upload** in the Diary. It uploads by itself:

- as soon as the app can reach your server again
- when you open the app or come back to it
- in the background, when your phone allows it

You can also tap **Upload now** in **Settings → Offline**, which lists everything still waiting.

Each workout is uploaded exactly once. If the connection drops while uploading, sending it again does not create a second copy.

A workout waits as long as it needs to. Nothing waiting is ever deleted by the app. If a workout has waited a week, you get one reminder notification.

## Changed somewhere else

If a workout you continued offline was also changed on the website or another device in the meantime, it is not uploaded over that change. It shows **Changed somewhere else. Tap to choose.** in **Settings → Offline**. Tap it and pick one:

- **Keep this phone's workout**: the phone's version replaces the other one.
- **Keep the other version**: nothing is uploaded; the phone's version is kept on the phone for a week, then removed.
- **Keep both**: the phone's version is saved as a separate workout, named with "(phone)".

If the workout was deleted somewhere else, you can save the phone's version as a new workout or discard it.

The same goes for **update saved workout**: if the saved workout was changed elsewhere before your phone reconnected, it is not overwritten, and the app tells you it was not updated.

## Exercise pictures

Pictures are downloaded for the exercises in this week's plan and in your saved workouts, on Wi-Fi only, up to 300 MB.

To keep pictures of other exercises, long-press an exercise in **Library → Exercises**, select more, and tap **Keep offline**. Exercises kept this way show a small cloud mark. To stop keeping them, select them and tap **Remove from offline**, or tap them under **Exercises kept offline** in **Settings → Offline**.

To download pictures on mobile data as well, turn on **Download pictures on mobile data** in **Settings → Offline**.

Pictures are stored in the phone's cache. If your phone runs low on space it may remove them; they are downloaded again on the next refresh.

## Settings → Offline

- **Waiting to upload**: what is still on your phone, and **Upload now**.
- **Refresh now** and the time of the last refresh.
- How much space saved data and pictures take.
- **Download pictures on mobile data**.
- **Clear offline data**: removes saved data and pictures. Workouts still waiting to upload are kept.
- **Exercises kept offline**.

## Accounts and servers

Saved data belongs to the account that downloaded it. When you sign in as someone else, it is removed and downloaded again for the new account. A workout waiting to upload is only ever sent under the account that logged it.

If you switch to another server while workouts are waiting, the app asks first. They stay on your phone and upload when you switch back. Removing a server's settings also removes what is waiting for it, so the app offers to upload first.

## Apple Watch and Wear OS

A workout started from your watch while the phone is offline works the same way: the phone starts it and keeps it. Heart rate from the watch waits until the workout itself has been uploaded, then is added to it.

## For self-hosters

Offline workouts need a server from the same release or later. An older server cannot accept workouts started offline: they stay on the phone, show **The server did not accept it** in **Settings → Offline**, and upload after the server is updated. Workouts started online keep working with an older server.

Nothing new needs to be configured on the server.
