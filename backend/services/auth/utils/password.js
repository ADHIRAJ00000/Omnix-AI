import argon2 from "argon2";

/**
 * Password hashing with Argon2id.
 *
 * Argon2id won the Password Hashing Competition and is the current OWASP first
 * choice. Unlike bcrypt it is memory-hard: an attacker with a GPU cannot get the
 * huge parallel speed-up they would against a CPU-only hash, because each guess
 * needs its own chunk of memory.
 *
 * The parameters below are OWASP's recommended minimum. The salt is generated
 * per password and stored inside the returned hash string, so no separate salt
 * column is needed.
 */
const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export const hashPassword = (plain) => argon2.hash(plain, HASH_OPTIONS);

/**
 * Returns false instead of throwing on a malformed stored hash.
 *
 * A user who registered through Google has no password hash at all; a thrown
 * error there would surface as a 500 rather than "wrong credentials".
 */
export const verifyPassword = async (hash, plain) => {
  if (!hash) return false;

  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
};
