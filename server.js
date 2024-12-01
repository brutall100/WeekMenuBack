const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// MongoDB connection URI and database name
const mongoUri = 'mongodb+srv://admin:U%409bt4jJ3iLhL_2@cluster0.6yrgc.mongodb.net/Week_menu?retryWrites=true&w=majority';
const dbName = process.env.DB_NAME;

let db;
const client = new MongoClient(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  tls: true, // Ensure TLS is enabled (it should be enabled by default)
});

(async function connectToDB() {
  try {
    await client.connect();
    db = client.db(dbName);
    console.log("Connected to MongoDB successfully");
  } catch (err) {
    console.error("Failed to connect to MongoDB", err);
    process.exit(1);
  }
})();
// Route handlers
app.get("/categories", async (req, res) => {
  try {
    const categories = await db.collection("categories").find().toArray();
    res.status(200).json(categories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ message: "Failed to fetch categories" });
  }
});

app.get("/categories/:id", async (req, res) => {
  const categoryId = req.params.id;

  try {
    const category = await db.collection("categories").findOne({ _id: new ObjectId(categoryId) });

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.status(200).json(category);
  } catch (error) {
    console.error("Error fetching category:", error);
    res.status(500).json({ message: "Failed to fetch category" });
  }
});

app.post("/categories", async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ message: "Category name is required" });
  }

  try {
    const result = await db.collection("categories").insertOne({ name });
    res.status(201).json({ message: "Category added", categoryId: result.insertedId });
  } catch (error) {
    console.error("Error adding category:", error);
    res.status(500).json({ message: "Failed to add category" });
  }
});

app.put("/categories/:id", async (req, res) => {
  const categoryId = req.params.id;
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ message: "Category name is required" });
  }

  try {
    const result = await db.collection("categories").updateOne(
      { _id: new ObjectId(categoryId) },
      { $set: { name } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.status(200).json({ message: "Category updated", categoryId });
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({ message: "Failed to update category" });
  }
});

app.delete("/categories/:id", async (req, res) => {
  const categoryId = req.params.id;

  try {
    const result = await db.collection("categories").deleteOne({ _id: new ObjectId(categoryId) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.status(200).json({ message: "Category deleted" });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({ message: "Failed to delete category" });
  }
});

app.get("/categories/:id/meals", async (req, res) => {
  const categoryId = req.params.id;

  try {
    const meals = await db.collection("meals").aggregate([
      { $match: { categoryIds: new ObjectId(categoryId) } },
      {
        $lookup: {
          from: "categories",
          localField: "categoryIds",
          foreignField: "_id",
          as: "categories",
        },
      },
      {
        $project: {
          name: 1,
          description: 1,
          categories: { $map: { input: "$categories", as: "cat", in: "$$cat.name" } },
        },
      },
    ]).toArray();

    if (!meals.length) {
      return res.status(404).json({ message: "No meals found for this category." });
    }

    res.status(200).json(meals);
  } catch (error) {
    console.error("Error fetching meals for category:", error);
    res.status(500).json({ message: "Failed to fetch meals for category" });
  }
});

app.get("/meals", async (req, res) => {
  try {
    const meals = await db.collection("meals").find().toArray();
    res.status(200).json(meals);
  } catch (error) {
    console.error("Error fetching meals:", error);
    res.status(500).json({ message: "Failed to fetch meals" });
  }
});

app.get('/meals/:id', async (req, res) => {
  const mealId = req.params.id;

  if (!ObjectId.isValid(mealId)) {
    return res.status(400).json({ message: "Invalid meal ID format" });
  }

  try {
    const meal = await db.collection('meals').aggregate([
      { $match: { _id: new ObjectId(mealId) } },
      {
        $lookup: {
          from: 'categories', // Kolekcija su kategorijomis
          localField: 'categoryIds',
          foreignField: '_id',
          as: 'categories'
        }
      },
      {
        $lookup: {
          from: 'ingredients', // Kolekcija su ingredientais
          localField: 'ingredientIds', // ingredientų ID laukas patiekaluose
          foreignField: '_id',
          as: 'ingredients'
        }
      },
      {
        $project: {
          name: 1,
          description: 1,
          categories: { $map: { input: '$categories', as: 'cat', in: '$$cat.name' } },
          ingredients: {
            $map: {
              input: '$ingredients',
              as: 'ing',
              in: {
                name: '$$ing.name',
                quantity: '$$ing.quantity',
                calories: '$$ing.calories',
                nutritionalValue: '$$ing.nutritionalValue'
              }
            }
          }
        }
      }
    ]).toArray();

    if (!meal.length) {
      return res.status(404).json({ message: 'Meal not found' });
    }

    res.status(200).json(meal[0]); // Grąžiname tik vieną patiekalą
  } catch (error) {
    console.error('Error fetching meal:', error);
    res.status(500).json({ message: 'Failed to fetch meal' });
  }
});

app.post("/meals", async (req, res) => {
  const { name, description, categoryIds, ingredients } = req.body;

  if (
    !name ||
    !description ||
    !Array.isArray(categoryIds) ||
    categoryIds.length === 0 ||
    !Array.isArray(ingredients) ||
    ingredients.length === 0
  ) {
    return res.status(400).json({ message: "Missing required fields or empty lists" });
  }

  try {
    const validCategories = await db
      .collection("categories")
      .find({ _id: { $in: categoryIds.map((id) => new ObjectId(id)) } })
      .toArray();

    if (validCategories.length !== categoryIds.length) {
      return res.status(400).json({ message: "Some categories do not exist." });
    }

    const ingredientInsertions = await db.collection("ingredients").insertMany(ingredients);
    const ingredientIds = Object.values(ingredientInsertions.insertedIds);

    const mealData = {
      name,
      description,
      categoryIds: categoryIds.map((id) => new ObjectId(id)),
      ingredientIds,
    };

    const mealInsertion = await db.collection("meals").insertOne(mealData);
    const insertedMeal = await db.collection("meals").findOne({ _id: mealInsertion.insertedId });

    res.status(201).json({ message: "Meal and ingredients added", meal: insertedMeal });
  } catch (error) {
    console.error("Error adding meal:", error);
    res.status(500).json({ message: "Failed to add meal and ingredients" });
  }
});

app.put("/meals/:id", async (req, res) => {
  const mealId = req.params.id;
  const { name, description, categoryIds, ingredients } = req.body;

  if (!name || !description || !Array.isArray(categoryIds) || !Array.isArray(ingredients)) {
    return res.status(400).json({ message: "Invalid data format" });
  }

  try {
    // Patikriname kategorijas
    const validCategories = await db
      .collection("categories")
      .find({ _id: { $in: categoryIds.map((id) => new ObjectId(id)) } })
      .toArray();

    if (validCategories.length !== categoryIds.length) {
      return res.status(400).json({ message: "Some categories do not exist." });
    }

    // Nauji ingredientai
    const newIngredients = ingredients.filter((ing) => !ing._id);
    const existingIngredientIds = ingredients
      .filter((ing) => ing._id)
      .map((ing) => new ObjectId(ing._id));

    // Įrašome naujus ingredientus
    const ingredientInsertions = await db.collection("ingredients").insertMany(newIngredients);
    const newIngredientIds = Object.values(ingredientInsertions.insertedIds);

    // Sukuriame naują ingredientų ID sąrašą
    const allIngredientIds = [...existingIngredientIds, ...newIngredientIds];

    // Atnaujiname patiekalą
    const updateResult = await db.collection("meals").updateOne(
      { _id: new ObjectId(mealId) },
      {
        $set: {
          name,
          description,
          categoryIds: categoryIds.map((id) => new ObjectId(id)),
          ingredientIds: allIngredientIds,
        },
      }
    );

    if (updateResult.matchedCount === 0) {
      return res.status(404).json({ message: "Meal not found" });
    }

    const updatedMeal = await db.collection("meals").findOne({ _id: new ObjectId(mealId) });
    res.status(200).json(updatedMeal);
  } catch (error) {
    console.error("Error updating meal:", error);
    res.status(500).json({ message: "Failed to update meal" });
  }
});

app.delete("/meals/:id", async (req, res) => {
  const mealId = req.params.id;

  try {
    const result = await db.collection("meals").deleteOne({ _id: new ObjectId(mealId) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Meal not found" });
    }

    res.status(200).json({ message: "Meal deleted" });
  } catch (error) {
    console.error("Error deleting meal:", error);
    res.status(500).json({ message: "Failed to delete meal" });
  }
});






app.get("/ingredients", async (req, res) => {
  try {
    const ingredients = await db.collection("ingredients").find().toArray();
    res.status(200).json(ingredients);
  } catch (error) {
    console.error("Error fetching ingredients:", error);
    res.status(500).json({ message: "Failed to fetch ingredients" });
  }
});

app.put("/ingredients/:id", async (req, res) => {
  const ingredientId = req.params.id;
  const { name, quantity, calories, nutritionalValue } = req.body;

  if (!name || !quantity || !calories || !nutritionalValue) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    if (!ObjectId.isValid(ingredientId)) {
      return res.status(400).json({ message: "Invalid ingredient ID format" });
    }

    const result = await db.collection("ingredients").updateOne(
      { _id: new ObjectId(ingredientId) },
      {
        $set: {
          name,
          quantity,
          calories,
          nutritionalValue,
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Ingredient not found" });
    }

    const updatedIngredient = await db
      .collection("ingredients")
      .findOne({ _id: new ObjectId(ingredientId) });

    res.status(200).json(updatedIngredient);
  } catch (error) {
    console.error("Error updating ingredient:", error);
    res.status(500).json({ message: "Failed to update ingredient" });
  }
});


app.get("/stories", async (req, res) => {
  try {
    const stories = await db.collection("stories").find().sort({ createdAt: -1 }).toArray();
    res.status(200).json(stories);
  } catch (error) {
    console.error("Error fetching stories:", error);
    res.status(500).json({ message: "Failed to fetch stories" });
  }
});

app.post("/stories", async (req, res) => {
  const { title, content, author } = req.body;

  if (!title || !content || !author) {
    return res.status(400).json({ message: "Title, content, and author are required" });
  }

  try {
    const result = await db.collection("stories").insertOne({
      title,
      content,
      author,
      createdAt: new Date(),
    });
    res.status(201).json({
      _id: result.insertedId,
      title,
      content,
      author,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("Error adding story:", error);
    res.status(500).json({ message: "Failed to add story" });
  }
});

app.put("/stories/:id", async (req, res) => {
  const storyId = req.params.id;
  const { title, content, author } = req.body;

  if (!title || !content || !author) {
    return res.status(400).json({ message: "Title, content, and author are required" });
  }

  try {
    const result = await db.collection("stories").updateOne(
      { _id: new ObjectId(storyId) },
      { $set: { title, content, author } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Story not found" });
    }

    res.status(200).json({ _id: storyId, title, content, author });
  } catch (error) {
    console.error("Error updating story:", error);
    res.status(500).json({ message: "Failed to update story" });
  }
});

app.delete("/stories/:id", async (req, res) => {
  const storyId = req.params.id;

  try {
    const result = await db.collection("stories").deleteOne({ _id: new ObjectId(storyId) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Story not found" });
    }

    res.status(200).json({ message: "Story deleted" });
  } catch (error) {
    console.error("Error deleting story:", error);
    res.status(500).json({ message: "Failed to delete story" });
  }
});


const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
