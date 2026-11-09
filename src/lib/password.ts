import bcrypt from 'bcryptjs';

const COST = 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);

export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

/**
 * Compared against when a login email does not exist, so a failed lookup
 * costs the same time as a wrong password and cannot be used to enumerate accounts.
 */
export const DUMMY_HASH = bcrypt.hashSync('timing-attack-mitigation', COST);
