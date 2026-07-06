/**
 * "Go to point" form in the UI — lets users jump to a point by index.
 */
export class GoToForm {
  constructor({ form, input, button }) {
    this.form = form;
    this.input = input;
    this.button = button;
  }

  /** Wire submit handler and clear invalid state on input. */
  setup(onSubmit) {
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      onSubmit(this.input.value);
    });

    this.input.addEventListener("input", () => {
      this.input.classList.remove("invalid");
    });
  }

  /** Enable the form once the point cloud is loaded (0-based index range). */
  enable(maxIndex) {
    this.input.disabled = false;
    this.button.disabled = false;
    this.input.max = maxIndex - 1;
  }

  setValue(value) {
    this.input.value = String(value);
  }

  /** Visual feedback when the entered index is out of range. */
  markInvalid() {
    this.input.classList.add("invalid");
  }

  clearInvalid() {
    this.input.classList.remove("invalid");
  }
}
