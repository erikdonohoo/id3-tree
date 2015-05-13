var arff = require('node-arff');
var _ = require('lodash');
var args = require('yargs').argv;

var accuracy = false;
var aData;
function Tree (arffData, className, useAccuracy) {
	this.data = aData = arffData;
	this.className = className;
	this.useAccuracy = accuracy = useAccuracy;

	this.features = [];
	for (var feature in this.data.types) {
		if (feature !== className)
			this.features.push(feature);
	}

	this.root = createTree(arffData.data, className, this.features);
}

Tree.prototype.guessValue = function (attribute, nominal) {

	var tree = this;
	if (nominal) {
		// Guess most likely value
		var values = _.groupBy(tree.data.data, function (instance) {
			return instance[attribute];
		});

		var index = _.max(Object.keys(values), function (attrValue) {
			return values[attrValue].length / tree.data.data.length;
		});

		return tree.data.types[attribute].oneof[index];

	} else {
		// Calculate average value
		return _.pluck(tree.data.data, attribute).reduce(function (prev, cur, index, arr) {
			return prev + (cur / arr.length);
		});
	}
};

Tree.prototype.predict = function (sample) {
	var node = this.root;
	while (node.type !== 'result') {
		var attribute = node.name;

		// Is nominal?
		var nominal = this.data.types[attribute].type === 'nominal';

		var sampleValue;
		if (nominal) {
			sampleValue = this.data.types[attribute].oneof[sample[attribute]];
		} else {
			sampleValue = sample[attribute];
		}

		if (sampleValue === '?' || !sampleValue) {
			// This value is missing, and we need to guess one
			sampleValue = this.guessValue(attribute, nominal);
		}

		// Determine which child node to walk down
		if (nominal) {
			var child = _.find(node.vals, function (val) {
				return val.name === sampleValue;
			});
			node = child.child;
		} else {
			// Get sign and value
			var numToCompare = parseInt(node.vals[0].name.substring(2));

			if (parseInt(sampleValue) <= numToCompare) {
				node = node.vals[0].child;
			} else {
				node = node.vals[1].child;
			}
		}
	}

	return node.val;
};

Tree.prototype.evaluate = function (samples) {

	var correct = 0;
	var tree = this;

	samples.forEach(function (sample) {
		var prediction = tree.predict(sample);

		var actual;
		if (tree.data.types[tree.className].type === 'nominal') {
			actual = tree.data.types[tree.className].oneof[sample[tree.className]];
		} else {
			actual = sample[tree.className];
		}
		if (prediction === actual) {
			correct++;
		}
	});

	return correct / samples.length;
};

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
	} else {
		bestAttribute = findBestAccuracy(arffData, className, featureList);
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
			var childNode = {name: value, type: 'attribute_value', nominal: nominal};
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
		var childNode = {name: '<= ' + splitPoint, type: 'attribute-value', nominal: nominal};
		childNode.child = createTree(firstHalf, className, remainingAttributes);
		var childNode2 = {name: '> ' + splitPoint, type: 'attribute-value', nominal: nominal};
		childNode2.child = createTree(secondHalf, className, remainingAttributes);
		treeNode.vals.push(childNode);
		treeNode.vals.push(childNode2);
	}

	return treeNode;
}

function findBestAccuracy (data, className, featureList) {
	return _.max(featureList, function (feature) {
		return 1;
	});
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

function printTree(tree, str) {
	str = str || '';

	tree.vals.forEach(function (child) {
		var log = str + tree.name + ' = ' + child.name;

		if (child.child.type === 'result')
			log += ': ' + child.child.val;

		console.log(log);

		if (child.child.type === 'attribute')
			printTree(child.child, str + '|  ');
	});

}

arff.load('voting.arff', function (err, data) {

	// Cross validation
	var crossValidate = args.cv;
	var split = data.data.length / crossValidate;

	var mixed = _.shuffle(data.data);

	var totalAcc = [];
	for (var i = 0; i < crossValidate; i++) {
		var first = mixed.slice(0, i * split);
		var test = mixed.slice(i * split, (i*split) + split);
		var end = mixed.slice((i*split) + split, mixed.length -1);

		var testData = first.concat(end);
		data.data = testData;
		var tree = new Tree(data, 'Class', args.accuracy);

		// Check now
		var acc = tree.evaluate(test);
		totalAcc.push(acc);
	}

	var accuracy = totalAcc.reduce(function (a, b) {
		return a + b;
	}, 0) / totalAcc.length;

	console.log(accuracy);

	// var tree = new Tree(data, 'Class', args.accuracy);
	// printTree(tree.root);
});
