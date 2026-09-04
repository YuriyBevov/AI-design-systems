import argon2 from "argon2";

export const minimumPasswordLength = 12;
export const maximumPasswordLength = 128;

const passwordHashOptions = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

export const validatePassword = (password: string): boolean =>
  password.length >= minimumPasswordLength && password.length <= maximumPasswordLength;

export const hashPassword = async (password: string): Promise<string> => {
  if (!validatePassword(password)) {
    throw new Error("Password does not satisfy the configured length policy");
  }

  return argon2.hash(password, passwordHashOptions);
};

export const verifyPassword = async (hash: string, password: string): Promise<boolean> => {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
};
