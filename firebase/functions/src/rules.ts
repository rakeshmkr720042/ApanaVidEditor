/**
 * Publishes firestore.rules with the Admin SDK (Firebase Rules API). Used by the deploy workflow on
 * the Spark plan: it needs only the Firebase Admin role, not the Service Usage permission that
 * `firebase deploy` asks for when it checks which Google APIs are on.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { initializeApp } from 'firebase-admin/app'
import { getSecurityRules } from 'firebase-admin/security-rules'

async function main() {
  initializeApp()
  const source = readFileSync(join(__dirname, '..', '..', 'firestore.rules'), 'utf8')
  const ruleset = await getSecurityRules().releaseFirestoreRulesetFromSource(source)
  console.log(`firestore rules released: ${ruleset.name}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
