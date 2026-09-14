import {
  CLASS_ALLERGY_DISMISS_STORAGE_KEY,
  dismissHouseholdAllergy,
  isHouseholdAllergyDismissed,
} from "../parent-class-allergy-alerts";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (key: string) => (key in data ? data[key] : null),
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  };
}

describe("household allergy dismiss", () => {
  it("hides only while the signature matches", () => {
    const storage = memoryStorage();
    expect(isHouseholdAllergyDismissed("66:peanut", storage)).toBe(false);
    dismissHouseholdAllergy("66:peanut", storage);
    expect(storage.getItem(CLASS_ALLERGY_DISMISS_STORAGE_KEY)).toBe("66:peanut");
    expect(isHouseholdAllergyDismissed("66:peanut", storage)).toBe(true);
    expect(isHouseholdAllergyDismissed("66:peanut|82:sesame", storage)).toBe(false);
  });
});
