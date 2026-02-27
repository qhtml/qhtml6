/*
 *  
 * additional custom elements to have fun with 
 *  adds all classes from w3.css as HTML tags that you can use by nesting. 
 *  designed to be used with qhtml.js but works standalone too
 *
 *
 */

function createW3CustomElementClass() {
    return class extends HTMLElement {
        constructor() {
            super();
        }

        connectedCallback() {
            this.applyClassesRecursively(this, []);
        }

        applyClassesRecursively(element, classes) {
            // Add the current element's classes to the array
            if (element.tagName.startsWith('W3-')) {
                const classToAdd = element.tagName.toLowerCase().replace('w3-', 'w3-');
                classes.push(classToAdd);
            }

            // Iterate over each child
            Array.from(element.children).forEach((child) => {
                if (child.tagName.startsWith('W3-')) {
                    // If child is a W3 element, recursively apply classes
                    this.applyClassesRecursively(child, [...classes]);
                } else {
                    // Apply all collected classes to the final non-W3 element
                    child.classList.add(...classes);
                }
            });

            // If the element is a W3 element, remove it after processing its children
            if (element.tagName.startsWith('W3-') && element.parentNode) {
                Array.from(element.children).forEach((child) => {
                    element.parentNode.insertBefore(child, element);
                });
                element.parentNode.removeChild(element);
            }
        }
    };
}

// Define the new element for each W3 component you want to use
// implements <w3-row> </w3-row> and other HTML elements for use anywhere on a page
// very convenient for styling your q-html with minimal extra code

customElements.define('w3-row', createW3CustomElementClass());
customElements.define('w3-row-padding', createW3CustomElementClass());
customElements.define('w3-auto', createW3CustomElementClass());
customElements.define('w3-stretch', createW3CustomElementClass());
customElements.define('w3-half', createW3CustomElementClass());
customElements.define('w3-third', createW3CustomElementClass());
customElements.define('w3-twothird', createW3CustomElementClass());
customElements.define('w3-quarter', createW3CustomElementClass());
customElements.define('w3-threequarter', createW3CustomElementClass());
customElements.define('w3-col', createW3CustomElementClass());
customElements.define('w3-rest', createW3CustomElementClass());
customElements.define('w3-container', createW3CustomElementClass());
customElements.define('w3-panel', createW3CustomElementClass());
customElements.define('w3-badge', createW3CustomElementClass());
customElements.define('w3-tag', createW3CustomElementClass());
customElements.define('w3-ul', createW3CustomElementClass());
customElements.define('w3-display-container', createW3CustomElementClass());
customElements.define('w3-block', createW3CustomElementClass());
customElements.define('w3-code', createW3CustomElementClass());
customElements.define('w3-codespan', createW3CustomElementClass());
customElements.define('w3-content', createW3CustomElementClass());
customElements.define('w3-table', createW3CustomElementClass());
customElements.define('w3-striped', createW3CustomElementClass());
customElements.define('w3-bordered', createW3CustomElementClass());
customElements.define('w3-centered', createW3CustomElementClass());
customElements.define('w3-hoverable', createW3CustomElementClass());
customElements.define('w3-table-all', createW3CustomElementClass());
customElements.define('w3-responsive', createW3CustomElementClass());
customElements.define('w3-card', createW3CustomElementClass()); // Same as w3-card-2
customElements.define('w3-card-2', createW3CustomElementClass()); // 2px bordered shadow
customElements.define('w3-card-4', createW3CustomElementClass()); // 4px bordered shadow
// The following are repeats from earlier, but included for completeness
customElements.define('w3-cell-row', createW3CustomElementClass());
customElements.define('w3-cell', createW3CustomElementClass());
customElements.define('w3-cell-top', createW3CustomElementClass());
customElements.define('w3-cell-middle', createW3CustomElementClass());
customElements.define('w3-cell-bottom', createW3CustomElementClass());
customElements.define('w3-bar', createW3CustomElementClass()); // Horizontal bar
customElements.define('w3-bar-block', createW3CustomElementClass()); // Vertical bar
customElements.define('w3-bar-item', createW3CustomElementClass()); // Common style for bar items
customElements.define('w3-sidebar', createW3CustomElementClass()); // Side bar
customElements.define('w3-collapse', createW3CustomElementClass()); // Responsive side navigation
customElements.define('w3-main', createW3CustomElementClass()); // Page content container
customElements.define('w3-dropdown-click', createW3CustomElementClass()); // Clickable dropdown
customElements.define('w3-dropdown-hover', createW3CustomElementClass()); // Hoverable dropdown
customElements.define('w3-button', createW3CustomElementClass()); // Rectangular button
customElements.define('w3-btn', createW3CustomElementClass()); // Rectangular button with shadows
customElements.define('w3-circle', createW3CustomElementClass()); // Circular button
customElements.define('w3-ripple', createW3CustomElementClass()); // Button with ripple effect
customElements.define('w3-input', createW3CustomElementClass()); // General input elements
customElements.define('w3-check', createW3CustomElementClass()); // Checkbox input type
customElements.define('w3-radio', createW3CustomElementClass()); // Radio input type
customElements.define('w3-select', createW3CustomElementClass()); // Input select element
customElements.define('w3-animate-input', createW3CustomElementClass()); // Animate input width
customElements.define('w3-modal', createW3CustomElementClass()); // Modal container
customElements.define('w3-modal-content', createW3CustomElementClass()); // Modal pop-up element
customElements.define('w3-tooltip', createW3CustomElementClass()); // Tooltip element
customElements.define('w3-text', createW3CustomElementClass()); // Tooltip text
customElements.define('w3-animate-top', createW3CustomElementClass()); // Animate from top
customElements.define('w3-animate-left', createW3CustomElementClass()); // Animate from left
customElements.define('w3-animate-bottom', createW3CustomElementClass()); // Animate from bottom
customElements.define('w3-animate-right', createW3CustomElementClass()); // Animate from right
customElements.define('w3-animate-opacity', createW3CustomElementClass()); // Animate opacity
customElements.define('w3-animate-zoom', createW3CustomElementClass()); // Animate zoom
customElements.define('w3-animate-fading', createW3CustomElementClass()); // Animate fading
customElements.define('w3-spin', createW3CustomElementClass()); // Spin animation
customElements.define('w3-tiny', createW3CustomElementClass()); // Font size 10px
customElements.define('w3-small', createW3CustomElementClass()); // Font size 12px
customElements.define('w3-large', createW3CustomElementClass()); // Font size 18px
customElements.define('w3-xlarge', createW3CustomElementClass()); // Font size 24px
customElements.define('w3-xxlarge', createW3CustomElementClass()); // Font size 32px
customElements.define('w3-xxxlarge', createW3CustomElementClass()); // Font size 48px
customElements.define('w3-jumbo', createW3CustomElementClass()); // Font size 64px
customElements.define('w3-wide', createW3CustomElementClass()); // Wider text
customElements.define('w3-serif', createW3CustomElementClass()); // Serif font
customElements.define('w3-sans-serif', createW3CustomElementClass()); // Sans-serif font
customElements.define('w3-cursive', createW3CustomElementClass()); // Cursive font
customElements.define('w3-monospace', createW3CustomElementClass()); // Monospace font
customElements.define('w3-center', createW3CustomElementClass()); // Centered content
customElements.define('w3-left', createW3CustomElementClass()); // Float left
customElements.define('w3-right', createW3CustomElementClass()); // Float right
customElements.define('w3-left-align', createW3CustomElementClass()); // Text align left
customElements.define('w3-right-align', createW3CustomElementClass()); // Text align right
customElements.define('w3-justify', createW3CustomElementClass()); // Text justify
customElements.define('w3-hide', createW3CustomElementClass()); // Hide content
customElements.define('w3-show', createW3CustomElementClass()); // Show content
customElements.define('w3-show-block', createW3CustomElementClass()); // Show content as block
customElements.define('w3-show-inline-block', createW3CustomElementClass()); // Show content as inline-block
customElements.define('w3-top', createW3CustomElementClass()); // Fixed content at top
customElements.define('w3-bottom', createW3CustomElementClass()); // Fixed content at bottom
customElements.define('w3-display-topleft', createW3CustomElementClass()); // Content at top left
customElements.define('w3-display-topright', createW3CustomElementClass()); // Content at top right
customElements.define('w3-display-bottomleft', createW3CustomElementClass()); // Content at bottom left
customElements.define('w3-display-bottomright', createW3CustomElementClass()); // Content at bottom right
customElements.define('w3-display-left', createW3CustomElementClass()); // Content at middle left
customElements.define('w3-display-right', createW3CustomElementClass()); // Content at middle right
customElements.define('w3-display-middle', createW3CustomElementClass()); // Content in the middle
customElements.define('w3-display-topmiddle', createW3CustomElementClass()); // Content at top middle
customElements.define('w3-display-bottommiddle', createW3CustomElementClass()); // Content at bottom middle
customElements.define('w3-display-position', createW3CustomElementClass()); // Specified position content
customElements.define('w3-display-hover', createW3CustomElementClass()); // Display content on hover
customElements.define('w3-opacity', createW3CustomElementClass()); // Opacity effect
customElements.define('w3-opacity-off', createW3CustomElementClass()); // Turn off opacity
customElements.define('w3-opacity-min', createW3CustomElementClass()); // Min opacity
customElements.define('w3-opacity-max', createW3CustomElementClass()); // Max opacity
customElements.define('w3-grayscale-min', createW3CustomElementClass()); // Min grayscale
customElements.define('w3-grayscale', createW3CustomElementClass()); // Grayscale effect
customElements.define('w3-grayscale-max', createW3CustomElementClass()); // Max grayscale
customElements.define('w3-sepia-min', createW3CustomElementClass()); // Min sepia
customElements.define('w3-sepia', createW3CustomElementClass()); // Sepia effect
customElements.define('w3-sepia-max', createW3CustomElementClass()); // Max sepia
customElements.define('w3-overlay', createW3CustomElementClass()); // Overlay effect
customElements.define('w3-red', createW3CustomElementClass());
customElements.define('w3-pink', createW3CustomElementClass());
customElements.define('w3-purple', createW3CustomElementClass());
customElements.define('w3-deep-purple', createW3CustomElementClass());
customElements.define('w3-indigo', createW3CustomElementClass());
customElements.define('w3-blue', createW3CustomElementClass());
customElements.define('w3-light-blue', createW3CustomElementClass());
customElements.define('w3-cyan', createW3CustomElementClass());
customElements.define('w3-aqua', createW3CustomElementClass());
customElements.define('w3-teal', createW3CustomElementClass());
customElements.define('w3-green', createW3CustomElementClass());
customElements.define('w3-light-green', createW3CustomElementClass());
customElements.define('w3-lime', createW3CustomElementClass());
customElements.define('w3-sand', createW3CustomElementClass());
customElements.define('w3-khaki', createW3CustomElementClass());
customElements.define('w3-yellow', createW3CustomElementClass());
customElements.define('w3-amber', createW3CustomElementClass());
customElements.define('w3-orange', createW3CustomElementClass());
customElements.define('w3-deep-orange', createW3CustomElementClass());
customElements.define('w3-blue-grey', createW3CustomElementClass());
customElements.define('w3-brown', createW3CustomElementClass());
customElements.define('w3-light-grey', createW3CustomElementClass());
customElements.define('w3-grey', createW3CustomElementClass());
customElements.define('w3-dark-grey', createW3CustomElementClass());
customElements.define('w3-black', createW3CustomElementClass());
customElements.define('w3-pale-red', createW3CustomElementClass());
customElements.define('w3-pale-yellow', createW3CustomElementClass());
customElements.define('w3-pale-green', createW3CustomElementClass());
customElements.define('w3-pale-blue', createW3CustomElementClass());
customElements.define('w3-transparent', createW3CustomElementClass());
customElements.define('w3-hover-white', createW3CustomElementClass());
customElements.define('w3-hover-black', createW3CustomElementClass());
customElements.define('w3-hover-red', createW3CustomElementClass());
customElements.define('w3-hover-blue', createW3CustomElementClass());
customElements.define('w3-hover-green', createW3CustomElementClass());
customElements.define('w3-hover-aqua', createW3CustomElementClass());
customElements.define('w3-hover-orange', createW3CustomElementClass());
customElements.define('w3-hover-grey', createW3CustomElementClass());
customElements.define('w3-hover-pale-green', createW3CustomElementClass());
customElements.define('w3-text-red', createW3CustomElementClass());
customElements.define('w3-text-green', createW3CustomElementClass());
customElements.define('w3-text-blue', createW3CustomElementClass());
customElements.define('w3-text-yellow', createW3CustomElementClass());
customElements.define('w3-text-light-grey', createW3CustomElementClass());
customElements.define('w3-text-grey', createW3CustomElementClass());
customElements.define('w3-text-dark-grey', createW3CustomElementClass());
customElements.define('w3-text-black', createW3CustomElementClass());
customElements.define('w3-text-white', createW3CustomElementClass());
customElements.define('w3-text-pink', createW3CustomElementClass());
customElements.define('w3-text-purple', createW3CustomElementClass());
customElements.define('w3-text-teal', createW3CustomElementClass());
customElements.define('w3-text-light-green', createW3CustomElementClass());
customElements.define('w3-text-lime', createW3CustomElementClass());
customElements.define('w3-text-deep-purple', createW3CustomElementClass());
customElements.define('w3-text-indigo', createW3CustomElementClass());
customElements.define('w3-text-light-blue', createW3CustomElementClass());
customElements.define('w3-text-blue-grey', createW3CustomElementClass());
customElements.define('w3-text-cyan', createW3CustomElementClass());
customElements.define('w3-text-aqua', createW3CustomElementClass());
customElements.define('w3-text-amber', createW3CustomElementClass());
customElements.define('w3-text-orange', createW3CustomElementClass());
customElements.define('w3-text-deep-orange', createW3CustomElementClass());
customElements.define('w3-text-sand', createW3CustomElementClass());
customElements.define('w3-text-khaki', createW3CustomElementClass());
customElements.define('w3-text-brown', createW3CustomElementClass());
customElements.define('w3-hover-border-color', createW3CustomElementClass());
customElements.define('w3-hover-opacity', createW3CustomElementClass());
customElements.define('w3-hover-opacity-off', createW3CustomElementClass());
customElements.define('w3-hover-shadow', createW3CustomElementClass());
customElements.define('w3-hover-grayscale', createW3CustomElementClass());
customElements.define('w3-hover-sepia', createW3CustomElementClass());
customElements.define('w3-hover-none', createW3CustomElementClass());
customElements.define('w3-round', createW3CustomElementClass());
customElements.define('w3-round-small', createW3CustomElementClass());
customElements.define('w3-round-medium', createW3CustomElementClass()); // Same as w3-round, for consistency in naming convention
customElements.define('w3-round-large', createW3CustomElementClass());
customElements.define('w3-round-xlarge', createW3CustomElementClass());
customElements.define('w3-round-xxlarge', createW3CustomElementClass());
customElements.define('w3-padding-small', createW3CustomElementClass());
customElements.define('w3-padding', createW3CustomElementClass());
customElements.define('w3-padding-large', createW3CustomElementClass());
customElements.define('w3-padding-16', createW3CustomElementClass());
customElements.define('w3-padding-24', createW3CustomElementClass());
customElements.define('w3-padding-32', createW3CustomElementClass());
customElements.define('w3-padding-48', createW3CustomElementClass());
customElements.define('w3-padding-64', createW3CustomElementClass());
customElements.define('w3-padding-top-64', createW3CustomElementClass());
customElements.define('w3-padding-top-48', createW3CustomElementClass());
customElements.define('w3-padding-top-32', createW3CustomElementClass());
customElements.define('w3-padding-top-24', createW3CustomElementClass());
customElements.define('w3-margin', createW3CustomElementClass());
customElements.define('w3-margin-top', createW3CustomElementClass());
customElements.define('w3-margin-right', createW3CustomElementClass());
customElements.define('w3-margin-bottom', createW3CustomElementClass());
customElements.define('w3-margin-left', createW3CustomElementClass());
customElements.define('w3-section', createW3CustomElementClass());
customElements.define('w3-border', createW3CustomElementClass());
customElements.define('w3-border-top', createW3CustomElementClass());
customElements.define('w3-border-right', createW3CustomElementClass());
customElements.define('w3-border-bottom', createW3CustomElementClass());
customElements.define('w3-border-left', createW3CustomElementClass());
customElements.define('w3-border-0', createW3CustomElementClass());
customElements.define('w3-border-color', createW3CustomElementClass());
customElements.define('w3-bottombar', createW3CustomElementClass());
customElements.define('w3-leftbar', createW3CustomElementClass());
customElements.define('w3-rightbar', createW3CustomElementClass());
customElements.define('w3-topbar', createW3CustomElementClass());
customElements.define('w3-hide-medium', createW3CustomElementClass());
customElements.define('w3-hide-small', createW3CustomElementClass());
customElements.define('w3-hide-large', createW3CustomElementClass());
customElements.define('w3-mobile', createW3CustomElementClass());

// w3-hover-border-color is already defined in the hover effect classes
(async function() { 
async function loadStylesheet(url) {
  try {
    // Fetch the CSS file
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    // Read the response as a Blob
    const blob = await response.blob();

    // Create a URL for the Blob
    const blobUrl = URL.createObjectURL(blob);

    // Create a new link element for the stylesheet
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = blobUrl;

    // Append the link to the end of the document
    document.body.appendChild(link);

    // Optional: Cleanup the blob URL once it is no longer needed
    link.onload = () => {
      URL.revokeObjectURL(blobUrl);
    };
  } catch (error) {
    console.error('Failed to load stylesheet:', error);
  }
}

// Example usage
//loadStylesheet('w3.css');

})()
