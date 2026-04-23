import { QAAgent } from './agent';

async function main() {
    const agent = new QAAgent();

    // Example Test Case: "Go to sauce demo, login, add item to cart, verify cart badge"
    const goal = "Login to the application using username 'standard_user' and password 'secret_sauce'. Then, click 'Add to cart' on the first item (Backpack). After that, verify the cart icon in the top right shows a badge with '1'. When you verify it says '1', mark the test as done.";
    const url = "https://www.saucedemo.com/";

    try {
        await agent.run(goal, url);
    } catch (e) {
        console.error("Test execution failed:", e);
    }
}

main();
