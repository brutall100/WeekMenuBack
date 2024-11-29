const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')
require('dotenv').config()

const { MongoClient, ObjectId } = require('mongodb')

const app = express()
app.use(cors())
app.use(bodyParser.json())

const mongoUri = process.env.MONGO_URI
const dbName = process.env.DB_NAME

const client = new MongoClient(mongoUri)

app.get('/categories', async (req, res) => {
	try {
		await client.connect()
		const db = client.db(dbName)
		const categories = await db.collection('categories').find().toArray()
		res.status(200).json(categories)
	} catch (error) {
		res.status(500).json({ message: 'Failed to fetch categories', error: error.message || error })
	} finally {
		await client.close()
	}
})

app.get('/categories/:id', async (req, res) => {
	const categoryId = req.params.id

	try {
		await client.connect()
		const db = client.db(dbName)

		const category = await db.collection('categories').findOne({ _id: new ObjectId(categoryId) })

		if (!category) {
			return res.status(404).json({ message: 'Kategorija nerasta' })
		}

		res.status(200).json(category)
	} catch (error) {
		console.error('Error fetching category:', error)
		res.status(500).json({ message: 'Nepavyko gauti kategorijos', error: error.message })
	} finally {
		await client.close()
	}
})

app.post('/categories', async (req, res) => {
	const { name } = req.body

	if (!name) {
		return res.status(400).json({ message: 'Category name is required' })
	}

	try {
		await client.connect()
		const db = client.db(dbName)
		const result = await db.collection('categories').insertOne({ name })
		res.status(201).json({ message: 'Category added', categoryId: result.insertedId })
	} catch (error) {
		res.status(500).json({ message: 'Failed to add category', error: error.message || error })
	} finally {
		await client.close()
	}
})

app.get('/meals', async (req, res) => {
	try {
		await client.connect()
		const db = client.db(dbName)
		const meals = await db.collection('meals').find().toArray()
		res.status(200).json(meals)
	} catch (error) {
		res.status(500).json({ message: 'Failed to fetch meals', error: error.message || error })
	} finally {
		await client.close()
	}
})

app.post('/meals', async (req, res) => {
	const { name, description, categoryIds } = req.body

	// Validacijos
	if (!name || !description || !Array.isArray(categoryIds) || categoryIds.length === 0) {
		return res.status(400).json({ message: 'Trūksta laukų arba kategorijų sąrašas tuščias.' })
	}

	try {
		await client.connect()
		const db = client.db(dbName)

		// Patikriname, ar visos kategorijos egzistuoja
		const validCategories = await db
			.collection('categories')
			.find({
				_id: { $in: categoryIds.map((id) => new ObjectId(id)) },
			})
			.toArray()

		if (validCategories.length !== categoryIds.length) {
			return res.status(400).json({ message: 'Kai kurios kategorijos neegzistuoja.' })
		}

		// Įterpiame naują meal
		const result = await db.collection('meals').insertOne({
			name,
			description,
			categoryIds: categoryIds.map((id) => new ObjectId(id)),
		})

		res.status(201).json({ message: 'Meal pridėtas', id: result.insertedId })
	} catch (error) {
		console.error('Error adding meal:', error.message)
		res.status(500).json({ message: 'Nepavyko pridėti meal', error: error.message })
	} finally {
		await client.close()
	}
})

// GET /categories/:id/meals - Gauti maisto planą pagal kategorijos ID
app.get('/categories/:id/meals', async (req, res) => {
	const categoryId = req.params.id

	try {
		// Konvertuojame į ObjectId
		const objectIdCategoryId = new ObjectId(categoryId)

		await client.connect()
		const db = client.db(dbName)

		// Naudojame MongoDB agregaciją
		const meals = await db
			.collection('meals')
			.aggregate([
				{
					$match: {
						categoryIds: objectIdCategoryId, // Filtruojame pagal kategorijos ID
					},
				},
				{
					$lookup: {
						from: 'categories', // Kolekcija, su kuria jungiamės
						localField: 'categoryIds',
						foreignField: '_id',
						as: 'categories', // Pridedame susietas kategorijas
					},
				},
				{
					$project: {
						name: 1,
						description: 1,
						categories: { $map: { input: '$categories', as: 'cat', in: '$$cat.name' } }, // Tik kategorijų pavadinimai
					},
				},
			])
			.toArray()

		// Jei meal nerasta
		if (!meals.length) {
			return res.status(404).json({ message: 'Meal nerasta šiai kategorijai.' })
		}

		res.status(200).json(meals)
	} catch (error) {
		console.error('Error fetching meals:', error)
		res.status(500).json({ message: 'Failed to fetch meals', error: error.message })
	} finally {
		await client.close()
	}
})

const PORT = process.env.PORT || 3003
app.listen(PORT, () => {
	console.log(`Server is running on http://localhost:${PORT}`)
})
