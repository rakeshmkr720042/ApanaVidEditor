// Prints the hashes kept for the install password, so the password itself never sits in the code.
// Usage: node scripts/install-password-hash.mjs "<password>"
// Put the two numbers in electron/installer.nsh (PWD_HASH_A/B).

const pw = process.argv[2]
if (!pw) { console.error('Give the password as the first argument.'); process.exit(1) }
// Same FNV-1a style hash as PwdHash in electron/installer.nsh (32-bit signed, printable ASCII only).
const fnv = (s, basis, prime) => {
  let h = basis | 0
  for (const ch of s) {
    let c = ch.charCodeAt(0)
    if (c < 32 || c > 126) c = 255
    h = Math.imul(h ^ c, prime) | 0
  }
  return h
}
console.log('PWD_HASH_A', fnv(pw, 0x811C9DC5, 16777619))
console.log('PWD_HASH_B', fnv(pw, 777777777, 1540483477))
