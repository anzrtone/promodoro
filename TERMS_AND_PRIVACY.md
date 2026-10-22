# Promodoro: Terms & Privacy

_Last updated: 2026-10-21_

Promodoro is a free, open-source focus timer for Windows and Android. This page has two parts: the **Terms** (the rules for using it) and the **Privacy Policy** (what data exists and where it goes). It is written in plain language on purpose. If something is unclear, ask.

**Who I am:** Promodoro is made and run by an individual developer, referred to here as "I" or "me" Anzar Sharif, contact: ranzarsharif@gmail.com).

---

## Part 1: Terms of Use

**1. Acceptance.** By installing or using Promodoro you agree to these Terms and the Privacy Policy below. If you don't agree, please don't use it.

**2. Age.** You must be at least 13 years old (16 in the EU/EEA, unless a parent or guardian agrees on your behalf where your local law allows it). I don't knowingly collect data from children under that age. If you think a child has sent me data, contact me and I'll delete it.

**3. The app and its license.** The source code is published under an open-source license (the GNU AGPL-3.0, see the `LICENSE` file in the repository), and that license governs your rights to the code: running it, studying it, modifying it and sharing it. These Terms cover your use of the app and of the optional online services. They do not take away any right the open-source license gives you. The name "Promodoro", the Pomo mascot, the icons and the artwork are not covered by the code license (see `ASSETS.md`). Please don't use them in a way that suggests your fork or product is the official one.

**4. Provided "as is".** Promodoro is free and I make it in my own time. It is provided **as is and as available, without warranties of any kind**, express or implied, including fitness for a particular purpose, reliability, accuracy and non-infringement. I don't promise it will be bug-free, uninterrupted, or that alarms and timers will always fire (phones and operating systems can silence or kill apps).

**5. Your data and backups.** Your notebook (sessions, notes, subjects, settings) is stored **on your device**. If you uninstall the app, clear its data, lose the device, or a bug corrupts it, it can be gone. **Keeping backups is your responsibility.** Use the built-in export and automatic backup features. Device sync is a convenience, not a backup service.

**6. Not medical or professional advice.** Promodoro is a productivity tool. It is not a medical device and does not diagnose, treat or give advice about ADHD, anxiety, sleep or any other condition. Don't rely on it for anything where a missed timer could cause harm, such as medication, safety or legal deadlines.

**7. Limitation of liability.** To the maximum extent the law allows, I am not liable for any indirect, incidental, special, consequential or punitive damages, or for lost data, lost profits, missed deadlines or lost time, arising from your use of or inability to use Promodoro, even if I was told this could happen. Where the law doesn't allow a limit on some liability, my total liability is limited to the smallest amount the law permits, and in any case to the amount you paid me for the app (which for most people is zero). Nothing in these Terms limits liability that can't legally be limited (for example, for fraud or for death or personal injury caused by negligence, where your law says so).

**8. Acceptable use of the online services.** The optional online services (sync relay, survey, user count) are shared and free. Don't abuse, overload, probe, reverse-engineer or attack them, don't use them to store anything unlawful, and don't try to access other people's data. I may rate-limit, block or remove access to protect the service.

**9. Online services can change or end.** I may change, pause or shut down the online services (including device sync) at any time, with notice in the repository or app where practical. The app keeps working fully offline without them. Sync snapshots expire automatically after 60 days of no use.

**10. Supporting the project.** Donations through Ko-fi are voluntary gifts that help keep the project going. They are handled by Ko-fi under Ko-fi's terms, and I don't receive your payment details. A supporter key unlocks cosmetic extras as a thank-you. It is not a purchase of a service, it carries no guarantee of future features, and donations are non-refundable by me (Ko-fi's own policies may apply). I can't promise any extras will exist forever, but I won't remove the free core features.

**11. Open-source contributions.** If you send code, art or other contributions to the project, you confirm you have the right to share them, and you agree they may be distributed under the project's license. I may ask for a contributor agreement for larger contributions.

**12. Changes to these Terms.** I may update this page. The date at the top changes when I do, and material changes will be noted in the repository's changelog or release notes. If you keep using the app after a change, you accept the new version.

**13. Governing law.** These Terms are governed by the laws of Bangladesh, without regard to conflict-of-law rules. Mandatory consumer-protection rights where you live still apply to you.

**14. Contact.** ranzarsharif@gmail.com

---

## Part 2: Privacy Policy

**The short version:** your notebook stays on your device. The app can talk to one small server (a Cloudflare Worker that I run) for three optional or minimal things: an anonymous daily install count (on by default, one switch to turn off), an optional welcome survey, and optional encrypted device sync. There are no accounts, no ads, no analytics SDKs and no third-party trackers.

### What stays on your device

Your sessions, notes, subjects, timer settings, the name Pomo calls you, your sticker book and your backups are stored locally. I never receive them. If you use a cloud-folder or file backup/sync, that data goes to the folder or cloud provider **you** chose, under that provider's terms and privacy policy, and not to me.

### Release check (GitHub, not my server)

Official release builds also ask GitHub (`api.github.com`) once a day whether a newer Promodoro release exists, so the app can tell you about it. **On by default; turn it off in Settings, in the About section ("Tell me about new releases").** The request carries no ID or any data about you, and it does not go through my server. GitHub, like any website, sees your IP address and handles it under [its own privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement). The app never downloads or installs anything by itself: it only links to the release page.

### What the app can send to my server

| What | When | What is sent | Why | How long I keep it |
|---|---|---|---|---|
| **Daily user count** | About once a day while you use the app, **on by default**. Turn it off any time in Settings, in the "You & Pomo" section. | A random install ID (not linked to you), your platform (Windows/Android), and the app version. | To know roughly how many people use Promodoro and which versions are out there. | Until you turn it off (turning it off deletes your row), or until I clear installs that haven't been seen for a long time. |
| **Welcome survey** | **Only if you opt in** with the toggle. | The same random ID, your answers to two multiple-choice questions (what you use it for, how you heard about it), any text you typed in the "other" boxes, your platform, app version and dates. **Never your name**, sessions, notes or subjects. You can preview the exact data in the app before agreeing. | To decide what to build next. | Until you withdraw. Turning the toggle off deletes your answers from the server. |
| **Device sync (relay)** | **Only if you set up sync with a pairing code.** (Syncing through a folder or file does not use my server.) | An end-to-end **encrypted** snapshot. The encryption key comes from your pairing code and never reaches the server, so I cannot read your data. | To keep your devices in step. | Automatically deleted after 60 days with no syncing, or sooner if you remove sync. |

Please **don't type personal information into the survey's free-text "other" boxes.** Anything you type there is stored as written.

### Information the server infrastructure sees

My code doesn't store IP addresses or user-agent strings. But the servers run on **Cloudflare**, and any internet service necessarily sees the IP address of a connecting device. Cloudflare may process it, and keep short-term technical logs, for delivering and securing the service, under [Cloudflare's privacy policy](https://www.cloudflare.com/privacypolicy/). I don't use that information to identify you.

### Legal bases (EU/UK users)

- **Survey:** your **consent** (the toggle). Withdraw it any time by turning the toggle off.
- **Daily user count:** my **legitimate interest** in knowing whether the app is used and maintained properly. It uses a random ID, collects very little, and has a one-tap opt-out. You can object by switching it off.
- **Sync relay:** it is needed to provide the sync feature you chose to switch on.

### Your rights

Depending on where you live (for example under the GDPR, UK GDPR or California's CCPA/CPRA), you may have the right to access, correct, delete or export your data, to object to or restrict its use, and to withdraw consent. Because the data I hold is keyed to a random ID with no name or email, the quickest way to exercise these rights is in the app: **turning off the survey toggle deletes your survey row, and turning off the daily user count deletes your count row.** If you want help, contact me at ranzarsharif@gmail.com and, for survey answers, include the survey ID shown in the "See exactly what gets sent" preview in Settings. I may not be able to find data that I can't link to you, but I'll do what I can. You can also complain to your local data-protection authority.

### What I don't do

I don't sell or share your data. I don't run advertising, profiling or cross-site tracking. I don't use analytics or crash-reporting SDKs. I don't collect your name, email, contacts, location or device identifiers, and I don't send your notebook anywhere without you turning on sync.

### International transfers

Cloudflare operates a global network, so data may be processed in countries other than yours, including the United States, under Cloudflare's safeguards.

### Children

Promodoro is not for children under 13 (16 in some regions). I don't knowingly collect data from them. See Terms section 2.

### Security

The sync relay stores ciphertext only, and connections use HTTPS. No online system is perfectly secure, and I can't guarantee that nothing will ever go wrong. If I learn of a breach that affects you, I'll tell users as the law requires.

### Third parties

- **Cloudflare** (hosting the small server): see above.
- **Ko-fi** (optional donations): if you click through, Ko-fi's own terms and privacy policy apply to you there.
- **Your own cloud folder provider**, if you point backup or sync at a folder (Dropbox, OneDrive, Google Drive, iCloud).
- **App stores or download sites** you get the app from, and your operating system, have their own policies.

### Changes

If I change how data is handled, I'll update this page and its date, and I'll ask for your consent again where the law requires it (for example, if the survey ever collected something new).

### Contact

ranzarsharif@gmail.com
