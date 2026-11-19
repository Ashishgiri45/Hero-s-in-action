# 16-Point KPI Tracker · Heroes in Action — Firebase setup

The site runs on **Firebase Hosting**. Each person signs in with their own work email and password.
The data lives in **Firestore**, and each person can read only their own part of it.
Free **Spark plan**: no billing needed.

Steps marked **YOU** need your own sign-in. Claude never types your passwords.

---

## One-time setup

### 1. Create the Firebase project — YOU (5 min)
1. Open https://console.firebase.google.com and sign in with the company Google account.
2. **Create a project** and name it `heroes-in-action`. Turn Google Analytics **off**, then **Create**.
3. Note the **Project ID** shown under the name, for example `heroes-in-action-1a2b3`.

### 2. Turn on sign-in — YOU
**Build → Authentication → Get started → Sign-in method → Email/Password → Enable** (first switch only) **→ Save**.

### 3. Create the database — YOU
**Build → Firestore Database → Create database**, then choose:
- Standard edition
- Location **asia-south1 (Mumbai)** (this can't be changed later)
- **Production mode**

Then **Create**.

### 4. Let GitHub deploy — YOU (Chrome only, one time)
Project ID: **heros-in-action** (already set in `.firebaserc`).
1. Firebase console → ⚙ Project settings → **Service accounts** → **Generate new private key**. A `.json` file downloads.
2. Open it in Notepad and copy everything.
3. GitHub repo → Settings → Secrets and variables → Actions → **New repository secret**.
   Name `FIREBASE_SERVICE_ACCOUNT`, paste the text, then **Add secret**.
4. Delete the downloaded `.json` file. It is a master key.

From then on, every push to `main` builds the site and deploys **the website + the Firestore security rules**.
Site: **https://heros-in-action.web.app**

### 5. First admin sign-in — YOU
1. Open the site and click **First time? Set your password**.
2. Use `e-com.ai@herocycles.com`, which is the first admin, listed in `firestore.rules` → `ADMINS`.
3. Open the verification email (check Spam too), then sign in.
4. **Upload** the month's workbook (*SE Evaluation Dashboard - MMM-YY.xlsx*).
5. Go to **Data Management → Publish to team**. An *Access_list* Excel downloads, showing who can sign in.

More admins: in Firestore, add a document `access/<their email>` with the field `role` = `admin`.
Or add their email to `ADMINS` in `firestore.rules` and deploy the rules again.

### 6. Tell the team
Send them the link and these steps:
1. Open the site and click **First time? Set your password**.
2. Use your work email (the one in the Contacts sheet).
3. Open the verification email, then sign in.

Forgot the password? Click **Forgot password?** on the sign-in page.

Only emails in the workbook's **Contacts** sheet get access. Today 19 SEs/ASMs have no row there, so add them first.

### 7. Automatic deploy
Already set up in step 4 (`.github/workflows/deploy-firebase.yml`). Data updates do **not** need a deploy.

---

## Daily update (admin)
1. Update and save the workbook as usual.
2. Open the site, sign in, then **Data Management → Upload** the workbook.
3. **Publish to team.** Everyone sees the new data when they open or refresh the site.

## Security
- The website and the GitHub repo contain **no data**. `build.py --firebase` never copies `data.js`, and the GitHub workflow stops if a data file appears in `dist/`.
- `.gitignore` keeps `private-data/`, `backup/`, `local/`, Excel and JSON files out of Git.
- Firestore rules allow reading only with a **verified** email, and each person reads only their own pack. Only admins can publish or change access.
- People who are removed from Contacts lose access at the next Publish.

## Test on this PC (optional)
This needs Java (Microsoft OpenJDK 21) and Node:
```
python build.py --firebase
firebase emulators:start --project demo-heroes --only auth,firestore,hosting
```
Then open http://127.0.0.1:5000. The test servers send no real emails and use no real project.

## Old site
The Netlify site (team password / `data.js`) keeps working until you switch the team over to the Firebase link.
