import { createHash } from 'crypto';

/**
 * Hashes a given string using SHA-256.
 * @param input - The string to hash.
 * @returns The SHA-256 hash of the input string.
 */
export function hashStringSHA256(input: string): string {
    const hash = createHash('sha256');
    hash.update(input);
    return hash.digest('hex');
}



if (require.main === module) {
    const keys = [
        '46b04cb2-aa2c-410a-aac0-3a382c61d78c:hzajAAeseZDuC1KDYFNzMvg69AbE8ObC',
        '4ce16786-b371-4120-8e43-2de5bd66f20d:hzajAAeseZDuC1KDYFNzMvg69AbE8ObC',
        '602ca84b-10cc-4970-93c5-b69f0100019b:hzajAAeseZDuC1KDYFNzMvg69AbE8ObC',
        'b4851b87-a8d0-47ad-8495-afcde4f302f0:hzajAAeseZDuC1KDYFNzMvg69AbE8ObC'
    ]

    for (const key of keys) {
        console.log(`${hashStringSHA256(key)}`);
    }

}