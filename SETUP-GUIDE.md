# Nail booking app – setup guide

You need about 20 minutes and a Google account (for Firebase). Everything below is free.

The app files are already in the GitHub repository **Zananails-gif/Zananails**. When you're done you'll have:
- **Customer link:** `https://zananails-gif.github.io/Zananails/`
- **Salon owner link:** `https://zananails-gif.github.io/Zananails/#owner`

---

## Step 1. Create the Firebase project

1. Go to <https://console.firebase.google.com> and sign in with a Google account.
2. Click **Create a project** (or **Add project**).
3. Name it, for example `zananails`, and click **Continue**.
4. Turn **Google Analytics** off (not needed) and click **Create project**.

## Step 2. Connect the app to Firebase

1. On the project home page, click the **web icon `</>`** ("Add app" → Web).
2. App nickname: `zananails`. Leave "Firebase Hosting" unticked. Click **Register app**.
3. Firebase shows a block of code with `const firebaseConfig = { ... }`. Keep this page open.
4. In another tab, open <https://github.com/Zananails-gif/Zananails/blob/main/config.js> and click the **pencil icon** (Edit).
5. Replace each `PASTE_...` value with the matching value from Firebase. Keep the quotes.
6. Click **Commit changes…** → **Commit changes**.

> The `apiKey` is not a secret. It's normal for it to be visible; the security rules in Step 5 protect the data.

## Step 3. Create the database

1. In Firebase, left menu: **Build → Firestore Database → Create database**.
2. Location: pick one near the salon (for Europe, `europe-west` or `eur3`). This can't be changed later.
3. Choose **Start in production mode** and click **Create**.

## Step 4. Create the salon owner's login

1. Left menu: **Build → Authentication → Get started**.
2. On the **Sign-in method** tab, click **Email/Password**, turn on the first switch, click **Save**.
3. Go to the **Users** tab → **Add user**. Enter the salon owner's email and a password. Click **Add user**.
4. In the user list, copy the **User UID** (a long code like `Xy12abC...`). You need it in the next step.

## Step 5. Add the security rules

1. Go to **Firestore Database → Rules** tab.
2. Delete everything there.
3. Open <https://github.com/Zananails-gif/Zananails/blob/main/firestore.rules>, click the **copy** icon (Copy raw file) and paste it into Firebase.
4. Replace `PASTE_OWNER_UID` with the User UID from Step 4 (keep the quotes).
5. Click **Publish**.

These rules mean:
- Anyone can see the salon details and which times are taken (no names or phone numbers).
- Customers can make a booking and cancel their own booking.
- Only the owner can see customer names and phone numbers, confirm bookings and change settings.

## Step 6. Turn on GitHub Pages

GitHub Pages is free only for **public** repositories, and Zananails is private right now.

1. Open <https://github.com/Zananails-gif/Zananails/settings>.
2. Scroll to the bottom (**Danger Zone**) → **Change visibility** → **Change to public** and confirm.
   This only makes the app's code visible. Customers' names, phone numbers and bookings are stored in Firebase, not on GitHub, and stay private.
3. In the left menu click **Pages**.
4. Under **Build and deployment → Source** choose **Deploy from a branch**, branch **main**, folder **/ (root)**. Click **Save**.
5. Wait 1–2 minutes. The link appears at the top of the Pages screen:
   `https://zananails-gif.github.io/Zananails/`

## Step 7. Allow the GitHub address in Firebase

1. In Firebase: **Authentication → Settings → Authorized domains → Add domain**.
2. Add `zananails-gif.github.io` and save.

## Step 8. First login as the salon owner

1. On the phone, open `https://zananails-gif.github.io/Zananails/#owner`.
2. Log in with the email and password from Step 4.
3. The app creates the salon with example services and takes you to **Настройки** (Settings).
4. Upload the logo, enter the salon name, address and phone, opening hours, days off, masters, services and prices. Tap **Сохранить** (Save).
5. Open the customer link and check that everything shows correctly.

## Step 9. Install on phones

- **Android (Chrome):** open the link → tap **Установить** (Install) in the app, or the menu ⋮ → **Install app / Add to Home screen**.
- **iPhone (Safari):** open the link → tap **Share** → **Add to Home Screen**.

The salon owner can install it too; after opening, tap **Вход для владельца салона** at the bottom of the home screen.

---

## Good to know

- **Free limits:** the free Firebase plan covers tens of thousands of reads and writes per day, far more than one salon needs. No card is needed.
- **New-booking alerts:** the owner sees new bookings instantly while the app is open (a badge and a message). Push notifications when the app is closed need Firebase's paid plan, so they're not included.
- **Customers' "My bookings"** are remembered on the phone they booked from.
- **Changing the app later:** edit the file on GitHub (pencil icon) or upload a new version. The site updates in about a minute.
- **If the owner sees "Нет доступа" (No access):** the UID in the rules doesn't match. The app shows the correct UID on that screen; copy it into the rules (Step 5) and publish again.
