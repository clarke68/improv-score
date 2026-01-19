import noUiSlider from 'nouislider';
import 'nouislider/dist/nouislider.css';

/**
 * Initialize a dual-handle range slider with noUiSlider
 * @param {HTMLElement} element - The container element
 * @param {Array<number>} initialValues - [min, max] initial values
 * @param {Object} options - noUiSlider options
 * @param {Function} onChange - Callback when values change
 * @returns {noUiSlider} The slider instance
 */
export function createRangeSlider(element, initialValues, options, onChange) {
  const slider = noUiSlider.create(element, {
    start: initialValues,
    connect: true,
    range: {
      min: options.min || 0,
      max: options.max || 100
    },
    step: options.step || 1,
    tooltips: options.tooltips !== false, // Show tooltips by default
    format: options.format || {
      to: (value) => Math.round(value),
      from: (value) => Number(value)
    }
  });

  if (onChange) {
    slider.on('update', (values) => {
      onChange(values.map(Number));
    });
  }

  return slider;
}

/**
 * Initialize a single-handle slider with noUiSlider
 * @param {HTMLElement} element - The container element
 * @param {number} initialValue - Initial value
 * @param {Object} options - noUiSlider options
 * @param {Function} onChange - Callback when value changes
 * @returns {noUiSlider} The slider instance
 */
export function createSingleSlider(element, initialValue, options, onChange) {
  const slider = noUiSlider.create(element, {
    start: [initialValue],
    connect: [true, false],
    range: {
      min: options.min || 0,
      max: options.max || 100
    },
    step: options.step || 1,
    tooltips: options.tooltips !== false,
    format: options.format || {
      to: (value) => Math.round(value),
      from: (value) => Number(value)
    }
  });

  if (onChange) {
    slider.on('update', (values) => {
      onChange(Number(values[0]));
    });
  }

  return slider;
}

/**
 * Destroy a slider instance
 * @param {noUiSlider} slider - The slider instance to destroy
 */
export function destroySlider(slider) {
  if (slider && slider.destroy) {
    slider.destroy();
  }
}

