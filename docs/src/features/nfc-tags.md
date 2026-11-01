# NFC Tags

Stick an NFC tag on a water bottle or cup, and tap your phone on it to log a drink, without opening the app and finding the right button. You set up each tag once; after that, one tap logs it.

NFC tags are in the mobile app only (iPhone and Android). The web app does not manage tags.

::: tip Water first
Tags log **water and drinks** today. Food, meals, medication and exercise are planned, and a tag you set up now keeps working when they arrive.
:::

## What you need

- A phone with NFC. Almost every recent iPhone (XS and later for tapping with the app closed) and Android phone has it.
- **Blank, rewritable NFC tags** or stickers, usually sold as **NTAG213**. They cost a few cents each.
- **On-metal tags for steel bottles.** Ordinary stickers usually fail on metal, so a steel tumbler needs a tag sold as "on-metal" or "anti-metal".
- A SparkyFitness mobile app and server that both include NFC tags. Update your server first; an older server shows "Your server does not support NFC tags yet".
- You must be signed in to your server in the app.

## Set up a tag

1. Open the water container you want to log (Library, then Water containers) and tap **Add NFC tag**. You can also go to **Settings, then NFC tags** and tap **+**.
2. Choose the container and how many drinks one tap logs, and name the tag.
3. Save, then hold your phone to the tag when asked.

If the tag already holds something else, such as a link or a card, the app asks before replacing it.

You can change what a tag does later, in the same screens, without touching the tag. To move a tag to a new sticker, open it and use **Write to a tag again**.

## Use a tag

Unlock your phone and hold it to the tag. The app does not need to be open.

| Phone | What happens |
|---|---|
| **iPhone (XS or later)** | A banner appears. Tap it, and SparkyFitness opens and logs. |
| **Android 15 and older** | SparkyFitness opens and logs. |
| **Android 16 and later** | SparkyFitness opens and logs, or Android shows a notification to tap first. Android 16 may also ask once whether the app may open from NFC. |

A message such as **Logged 1 × Stanley** appears with **Tap to undo**.

If tapping does nothing, open **Settings, then NFC tags** and use **Scan a tag**, then hold the phone to the tag.

## Good to know

- **Accidental taps:** turn on **Ask before logging** for a tag to get a Log or Cancel prompt on every tap.
- **Double taps:** a second tap within about 10 seconds is ignored, so holding the phone on the tag too long logs only one drink.
- **Deleted container:** if you delete the container a tag logs, the tap tells you and logs nothing. Open the tag and pick another container.
- **Someone else's tag:** a tag that is not set up on your account logs nothing. The app offers to set it up for you.
- **Offline:** if your server cannot be reached, the app says so and logs nothing. Tap again when you are back online.
- **Several people:** each person sets up their own tags, so two people can use the same bottle, each logging to their own account.
- **Removing a tag:** open it and choose **Remove this tag**. The sticker keeps its link, but a tap on it no longer logs.

## Privacy

A tag holds only a web link with a random code, `https://tag.sparkyfitness.com/t/<code>`. It holds no health data, and what the code does is stored on **your own server**. The tag site stores nothing and is used only so your phone knows the link belongs to the SparkyFitness app. Without the app installed, the link opens a page that tells you to install it.

## Limits

- A tag logs to the server the app is signed in to. If you switch servers, a tag from the other server reads as unknown.
- Tapping with the app closed works in the App Store and Google Play versions. Development builds, and builds made from source with a different app ID, use **Scan a tag** instead.
- An APK from GitHub releases opens from a tap on Android, but is not updated by Google Play.
