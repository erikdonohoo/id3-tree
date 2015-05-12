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

	var instances = _.uniq(_.pluck(arffData, className));

	// Check recursion base cases
	if (featureList.length === 1) {
		return {type: 'result', val: instances[0], name: instances[0]};
	}

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

	var remainingAttributes = _.without(featureList, bestAttribute);
	var possibleValues = _.uniq(_.pluck(arffData, bestAttribute));

	// if (arffData.types[bestAttribute].type === 'nominal') {
	// 	possibleValues.map(function (value) {
	// 		return arffData.types[bestAttribute].oneof[value];
	// 	});
	// }

	var treeNode = {name: bestAttribute, type: 'attribute'};
	treeNode.vals = possibleValues.map(function (value) {
		var newDataSet = arffData.filter(function (instance) {
			instance[bestAttribute] = value;
		});
		var childNode = {name: value, type: 'attribute_value'};
		childNode.child = createTree(newDataSet, className, remainingAttributes);
	});

	return treeNode;
}

function findMaxGain (data, className, featureList) {
	return _.max(featureList, function (feature) {

		var featureValues = aData.types[feature].type === 'nominal' ?
			aData.types[feature].oneof :
			_.unique(_.pluck(data, feature));

		var entropyOfSet = entropy(_.pluck(data, className));

		var setSize = data.length;
		var entropies = featureValues.map(function (featureVal) {
			var subset = data.filter(function (instance) {
				var val = aData.types[feature].type === 'nominal' ?
					aData.types[feature].oneof[instance[featureVal]] :
					instance[featureVal];
				return val === featureVal;
			});
			return (subset.length / setSize) * entropy(_.pluck(subset, className));
		});

		var sumOfEntropies =  entropies.reduce(function (a,b) {
			return a + b;
		}, 0);

		console.log(feature, entropyOfSet - sumOfEntropies);
		return entropyOfSet - sumOfEntropies;
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

arff.load('lenses.arff', function (err, data) {
	var tree = new Tree(data, 'contact-lenses', args.accuracy, args.cv);
	console.log(tree.root);
});
