export class GoToForm {
  constructor({ form, input, button }) {
    this.form = form;
    this.input = input;
    this.button = button;
  }

  setup(onSubmit) {
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      onSubmit(this.input.value);
    });

    this.input.addEventListener("input", () => {
      this.input.classList.remove("invalid");
    });
  }

  enable(maxIndex) {
    this.input.disabled = false;
    this.button.disabled = false;
    this.input.max = maxIndex - 1;
  }

  setValue(value) {
    this.input.value = String(value);
  }

  markInvalid() {
    this.input.classList.add("invalid");
  }

  clearInvalid() {
    this.input.classList.remove("invalid");
  }
}
