import { describe, expect, it } from "vitest";
import {
  CreateSavedAddressInput,
  SavedAddressDTO,
  SavedAddressType,
  UpdateSavedAddressInput,
} from "../../src/schemas/saved-address.js";

const validCreate = {
  type: "home" as const,
  name: "Дом",
  address_label: "ул. Тукая, д. 4, ЖК Царёво",
  lat: 55.85,
  lng: 49.15,
};

describe("SavedAddressType", () => {
  it("accepts home/work/custom", () => {
    for (const t of ["home", "work", "custom"]) {
      expect(SavedAddressType.safeParse(t).success).toBe(true);
    }
  });

  it("rejects unknown type", () => {
    expect(SavedAddressType.safeParse("office").success).toBe(false);
  });
});

describe("CreateSavedAddressInput", () => {
  it("accepts valid input", () => {
    expect(CreateSavedAddressInput.safeParse(validCreate).success).toBe(true);
  });

  it("transforms name via sanitizeText", () => {
    const out = CreateSavedAddressInput.parse({ ...validCreate, name: "  Мой   дом  " });
    expect(out.name).toBe("Мой дом");
  });

  it("transforms address_label via sanitizeText", () => {
    const out = CreateSavedAddressInput.parse({
      ...validCreate,
      address_label: "  ул.  Тукая  ",
    });
    expect(out.address_label).toBe("ул. Тукая");
  });

  it("strips html from name", () => {
    const out = CreateSavedAddressInput.parse({
      ...validCreate,
      name: "<b>Дом</b>",
    });
    expect(out.name).toBe("Дом");
  });

  it("strips html from address_label", () => {
    const out = CreateSavedAddressInput.parse({
      ...validCreate,
      address_label: "<script>alert(1)</script>ул. Тукая",
    });
    expect(out.address_label).toBe("ул. Тукая");
  });

  it("rejects name longer than 50 chars", () => {
    expect(
      CreateSavedAddressInput.safeParse({ ...validCreate, name: "А".repeat(51) }).success,
    ).toBe(false);
  });

  it("accepts name exactly 50 chars", () => {
    expect(
      CreateSavedAddressInput.safeParse({ ...validCreate, name: "А".repeat(50) }).success,
    ).toBe(true);
  });

  it("rejects address_label longer than 200 chars", () => {
    expect(
      CreateSavedAddressInput.safeParse({ ...validCreate, address_label: "Б".repeat(201) }).success,
    ).toBe(false);
  });

  it("accepts address_label exactly 200 chars", () => {
    expect(
      CreateSavedAddressInput.safeParse({ ...validCreate, address_label: "Б".repeat(200) }).success,
    ).toBe(true);
  });

  it("rejects empty name", () => {
    expect(CreateSavedAddressInput.safeParse({ ...validCreate, name: "" }).success).toBe(false);
  });

  it("rejects empty address_label", () => {
    expect(CreateSavedAddressInput.safeParse({ ...validCreate, address_label: "" }).success).toBe(
      false,
    );
  });

  it("rejects lat out of range", () => {
    expect(CreateSavedAddressInput.safeParse({ ...validCreate, lat: 91 }).success).toBe(false);
    expect(CreateSavedAddressInput.safeParse({ ...validCreate, lat: -91 }).success).toBe(false);
  });

  it("rejects lng out of range", () => {
    expect(CreateSavedAddressInput.safeParse({ ...validCreate, lng: 181 }).success).toBe(false);
    expect(CreateSavedAddressInput.safeParse({ ...validCreate, lng: -181 }).success).toBe(false);
  });

  it("rejects invalid type", () => {
    expect(CreateSavedAddressInput.safeParse({ ...validCreate, type: "gym" }).success).toBe(false);
  });
});

describe("UpdateSavedAddressInput", () => {
  it("accepts empty object (all optional)", () => {
    expect(UpdateSavedAddressInput.safeParse({}).success).toBe(true);
  });

  it("accepts partial update with name only", () => {
    const out = UpdateSavedAddressInput.parse({ name: "Офис" });
    expect(out.name).toBe("Офис");
    expect(out.address_label).toBeUndefined();
  });

  it("transforms name via sanitizeText", () => {
    const out = UpdateSavedAddressInput.parse({ name: "  Мой   офис  " });
    expect(out.name).toBe("Мой офис");
  });

  it("transforms address_label via sanitizeText", () => {
    const out = UpdateSavedAddressInput.parse({ address_label: "  ул.  Ленина  " });
    expect(out.address_label).toBe("ул. Ленина");
  });

  it("strips html from name", () => {
    const out = UpdateSavedAddressInput.parse({ name: "<i>Работа</i>" });
    expect(out.name).toBe("Работа");
  });

  it("strips html from address_label", () => {
    const out = UpdateSavedAddressInput.parse({
      address_label: "<style>*{}</style>Казань",
    });
    expect(out.address_label).toBe("Казань");
  });

  it("accepts partial update with coords only", () => {
    const out = UpdateSavedAddressInput.parse({ lat: 55.8, lng: 49.1 });
    expect(out.lat).toBe(55.8);
    expect(out.lng).toBe(49.1);
    expect(out.name).toBeUndefined();
  });

  it("rejects name shorter than 1 char", () => {
    expect(UpdateSavedAddressInput.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects lat out of range", () => {
    expect(UpdateSavedAddressInput.safeParse({ lat: 100 }).success).toBe(false);
  });
});

const validDTO = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  type: "custom" as const,
  name: "Курорт",
  address_label: "ул. Тукая, д. 4",
  lat: 55.85,
  lng: 49.15,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

describe("SavedAddressDTO", () => {
  it("accepts valid DTO", () => {
    expect(SavedAddressDTO.safeParse(validDTO).success).toBe(true);
  });

  it("rejects non-uuid id", () => {
    expect(SavedAddressDTO.safeParse({ ...validDTO, id: "bad" }).success).toBe(false);
  });

  it("rejects missing type", () => {
    const { type, ...rest } = validDTO;
    expect(SavedAddressDTO.safeParse(rest).success).toBe(false);
  });

  it("accepts all address types", () => {
    for (const t of ["home", "work", "custom"]) {
      expect(SavedAddressDTO.safeParse({ ...validDTO, type: t }).success).toBe(true);
    }
  });
});
