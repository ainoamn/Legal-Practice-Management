import argon2 from "argon2";
const options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
} satisfies argon2.HashOptions;
export const hashPassword = (password: string) =>
  argon2.hash(password, options);
