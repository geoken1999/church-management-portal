export interface TodoFieldErrors {
  title?: string;
  dueAt?: string;
}

export function validateTodo(input: { title: string; dueAt: string }): TodoFieldErrors {
  const errors: TodoFieldErrors = {};

  if (!input.title.trim()) {
    errors.title = "Title is required.";
  } else if (input.title.trim().length < 2) {
    errors.title = "Title must be at least 2 characters.";
  }

  if (input.dueAt && Number.isNaN(new Date(input.dueAt).getTime())) {
    errors.dueAt = "Enter a valid date and time.";
  }

  return errors;
}
