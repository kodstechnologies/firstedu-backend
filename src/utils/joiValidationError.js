import { ApiError } from "./ApiError.js";

/** Turn camelCase/snake_case keys into short labels like "Question text". */
function humanizeKey(key) {
  if (typeof key !== "string") return String(key);
  const spaced = key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/**
 * Builds a readable scope from Joi path, e.g.
 * ['questions', 0, 'questionText'] → "Question 1 · Question text"
 */
function buildScope(path) {
  if (!Array.isArray(path) || path.length === 0) return "Request";
  const parts = [];
  let i = 0;
  while (i < path.length) {
    const segment = path[i];
    if (segment === "questions" && typeof path[i + 1] === "number") {
      parts.push(`Question ${path[i + 1] + 1}`);
      i += 2;
      continue;
    }
    if (segment === "options" && typeof path[i + 1] === "number") {
      parts.push(`Option ${path[i + 1] + 1}`);
      i += 2;
      continue;
    }
    if (segment === "sections" && typeof path[i + 1] === "number") {
      parts.push(`Section ${path[i + 1] + 1}`);
      i += 2;
      continue;
    }
    if (typeof segment === "number") {
      parts.push(`Item ${segment + 1}`);
      i += 1;
      continue;
    }
    parts.push(humanizeKey(segment));
    i += 1;
  }
  return parts.join(" · ");
}

function formatEmptyString(path) {
  const last = path[path.length - 1];
  const parentPath = path.slice(0, -1);
  const parent = parentPath.length ? buildScope(parentPath) : null;
  const label = typeof last === "string" ? humanizeKey(last) : "This field";
  if (parent) {
    return `${parent}: ${label} cannot be empty.`;
  }
  return `${label} cannot be empty.`;
}

function issueFromType(type, context, path) {
  const limit = context?.limit;
  const valids = context?.valids;

  switch (type) {
    case "string.min":
      return typeof limit === "number"
        ? `Must be at least ${limit} character(s).`
        : "This field cannot be empty.";
    case "string.max":
      return typeof limit === "number"
        ? `Must be at most ${limit} character(s).`
        : "Value is too long.";
    case "string.email":
      return "Enter a valid email address.";
    case "string.pattern.base":
      return "The value does not match the required format.";
    case "any.required":
      return "This field is required.";
    case "any.only":
      if (Array.isArray(valids) && valids.length) {
        const allowed = valids.filter((v) => v !== null);
        return allowed.length
          ? `Must be one of: ${allowed.join(", ")}.`
          : "Invalid value.";
      }
      return "Invalid value.";
    case "number.base":
      return "Must be a valid number.";
    case "number.min":
      return typeof limit === "number"
        ? `Must be at least ${limit}.`
        : "Must be a valid number.";
    case "number.max":
      return typeof limit === "number"
        ? `Must be at most ${limit}.`
        : "Number is too large.";
    case "array.base":
      return "Must be a list.";
    case "array.min":
      if (path[0] === "categories" && limit === 1) {
        return "Add at least one category.";
      }
      return typeof limit === "number"
        ? `Add at least ${limit} item(s).`
        : "Not enough items.";
    case "array.max":
      return typeof limit === "number"
        ? `At most ${limit} item(s) allowed.`
        : "Too many items.";
    case "boolean.base":
      return "Must be true or false.";
    case "object.unknown":
      return "Contains an unknown field.";
    case "alternatives.match":
      return "The value does not match any allowed option.";
    case "any.invalid":
      if (Array.isArray(valids) && valids.length) {
        return `Must be one of: ${valids.filter((v) => v !== null).join(", ")}.`;
      }
      return "Invalid value.";
    default:
      return null;
  }
}

/** Fallback when we do not map the Joi type. */
function softenRawMessage(message) {
  if (!message || typeof message !== "string") return "Validation failed.";
  let s = message.trim();
  s = s.replace(
    /^"([^"]+)"\s+is\s+not\s+allowed\s+to\s+be\s+empty\.?$/i,
    "This field cannot be empty."
  );
  s = s.replace(/^"([^"]+)"\s+is\s+required\.?$/i, "This field is required.");
  return s;
}

function formatJoiDetail(detail) {
  const path = detail.path || [];
  const type = detail.type;

  if (type === "string.empty") {
    return formatEmptyString(path);
  }

  const scope = buildScope(path);
  const issue = issueFromType(type, detail.context || {}, path);
  if (issue) {
    if (path[0] === "categories" && type === "array.min") {
      return issue;
    }
    return scope === "Request" ? issue : `${scope}: ${issue}`;
  }

  const fallback = softenRawMessage(detail.message);
  return scope === "Request" ? fallback : `${scope}: ${fallback}`;
}

/**
 * Throws ApiError with plain-language validation messages.
 * `meta` is the list of those messages (same as before, but readable).
 */
export function throwJoiValidationError(joiError) {
  const details = joiError?.details;
  const messages = Array.isArray(details)
    ? details.map((d) => formatJoiDetail(d))
    : [];
  if (messages.length === 0) {
    throw new ApiError(400, joiError?.message || "Validation failed");
  }
  const message =
    messages.length === 1 ? messages[0] : messages.join("; ");
  throw new ApiError(400, message, messages);
}
