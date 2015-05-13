var arff = require('node-arff');
var _ = require('lodash');
var args = require('yargs').argv;

var accuracy = false;
var aData;
function Tree (arffData, className, useAccuracy, crossValidateNum) {
	this.data = aData = arffData;
	this.className = className;
	this.useAccuracy = accuracy = useAccuracy;
	this.crossValidateNum = crossValidateNum;

	this.features = [];
	for (var feature in this.data.types) {
		if (feature !== className)
			this.features.push(feature);
	}

	this.root = createTree(arffData.data, className, this.features);
}

function createTree (arffData, className, featureList) {

	var classes = _.uniq(_.pluck(arffData, className));

	// Check if only one instance remains
	if (classes.length === 1) {
		return {type: 'result', val: aData.types[className].oneof[classes[0]]};
	}

	// Check if no features left to compare on
	if (featureList.length === 0) {
		var topAttr = _.sortBy(instances, function (instance) {
			return instances.filter(function (i) {
				return i === instance;
			}).length;
		}).reverse()[0];

		return {type: 'result', val: topAttr};
	}

	// Get values for class
	var classValues = aData.types[className].oneof;

	// Find best feature by gain
	var bestAttribute;
	if (!accuracy) {
		bestAttribute = findMaxGain(arffData, className, featureList);
	}

	var nominal = aData.types[bestAttribute].type === 'nominal';
	var remainingAttributes = nominal ? _.without(featureList, bestAttribute) : featureList;
	var possibleValues = _.uniq(_.pluck(arffData, bestAttribute));
	var splitPoint;

	if (nominal) {
		possibleValues = aData.types[bestAttribute].oneof;
	} else {
		splitPoint = bestSplit(arffData, bestAttribute, _.pluck(arffData, bestAttribute), entropy(_.pluck(arffData, className)), className);
	}

	var treeNode = {name: bestAttribute, type: 'attribute'};
	if (nominal) {
		treeNode.vals = possibleValues.map(function (value, index) {
			var newDataSet = arffData.filter(function (instance) {
				return aData.types[bestAttribute].type === 'nominal' ?
					aData.types[bestAttribute].oneof[instance[bestAttribute]] === value :
					instance[bestAttribute] === value;
			});
			var childNode = {name: value, type: 'attribute_value'};
			childNode.child = createTree(newDataSet, className, remainingAttributes);
			return childNode;
		});
	} else {
		// Numeric split
		var firstHalf = arffData.filter(function (item) {
			return item[bestAttribute] <= splitPoint;
		});
		var secondHalf = arffData.filter(function (item) {
			return item[bestAttribute] > splitPoint;
		});
		treeNode.vals = [];
		var childNode = {name: '<= ' + splitPoint, type: 'attribute-value'};
		childNode.child = createTree(firstHalf, className, remainingAttributes);
		var childNode2 = {name: '> ' + splitPoint, type: 'attribute-value'};
		childNode2.child = createTree(secondHalf, className, remainingAttributes);
		treeNode.vals.push(childNode);
		treeNode.vals.push(childNode2);
	}

	return treeNode;
}

function findMaxGain (data, className, featureList) {

	var entropyOfSet = entropy(_.pluck(data, className));
	return _.max(featureList, function (feature) {

		var nominal = aData.types[feature].type === 'nominal';
		var featureValues = nominal ?
			aData.types[feature].oneof :
			_.pluck(data, feature);

		var setSize = data.length;
		var entropies;
		if (nominal) {
			// Nominal entropy
			entropies = featureValues.map(function (featureVal) {
				// Find all data with this value
				var subset = data.filter(function (instance) {
					var val = aData.types[feature].type === 'nominal' ?
						aData.types[feature].oneof[instance[feature]] :
						instance[featureVal];
					return val === featureVal;
				});
				return (subset.length / setSize) * entropy(_.pluck(subset, className));
			});
		} else {
			// Numeric entropy
			featureValues.sort();

			var splitPoint = bestSplit(data, feature, featureValues, entropyOfSet, className);
			var firstHalf = data.filter(function (item) {
				return item[feature] <= splitPoint;
			});
			var secondHalf = data.filter(function (item) {
				return item[feature] > splitPoint;
			});
			entropies = [firstHalf, secondHalf].map(function (list) {
				return (list.length / data.length) * entropy(_.pluck(list, className));
			});
		}

		var sumOfEntropies =  entropies.reduce(function (a,b) {
			return a + b;
		}, 0);

		return entropyOfSet - sumOfEntropies;
	});
}

function bestSplit(data, feature, featureValues, setEntropy, className) {
	var unique = _.uniq(featureValues);
	return _.max(unique, function (number) {
		var firstHalf = data.filter(function (item) {
			return item[feature] <= number;
		});
		var secondHalf = data.filter(function (item) {
			return item[feature] > number;
		});

		var entropies = [firstHalf, secondHalf].map(function (list) {
			return (list.length / data.length) * entropy(_.pluck(list, className));
		});

		return setEntropy - entropies.reduce(function (a, b) {
			return a + b;
		}, 0);
	});
}

function entropy (values) {
	var uniqueValues = _.uniq(values);
	var probabilities = uniqueValues.map(function (val) {
		return ratio(val, values);
	});
	var logValues = probabilities.map(function (prob) {
		return -prob * (Math.log(prob) / Math.log(2));
	});
	return logValues.reduce(function (a, b) {
		return a + b;
	}, 0);
}

function ratio(value, list) {
	var totalValues = list.filter(function (val) {
		return val === value;
	}).length;

	return totalValues / list.length;
}

function printTree(tree) {
	console.log(tree);
	if (tree.vals) {
		tree.vals.forEach(function (branch) {
			console.log('\n\nComes from ' + tree.name + ' ' + tree.type + ' ' + branch.name);
			printTree(branch.child);
		});
	}
}

arff.load('iris.arff', function (err, data) {
	var tree = new Tree(data, 'class', args.accuracy, args.cv);
	printTree(tree.root);
});
