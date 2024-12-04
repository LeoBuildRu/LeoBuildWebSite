from django.shortcuts import render
from django.http import JsonResponse
from .models import *
from django.views.decorators.csrf import csrf_exempt
from django.db.models import Q
from django.contrib.auth import logout
import uuid
import json

# Create your views here.

cart_total = 0

def index_page(request):
    return render(request, 'index.html')

def builder_page(request):
    logout(request)  # стандартная функция выхода
    request.session.flush()  # очищаем сессию
    return render(request, 'builder.html')

def get_companys(request):
    category_name = request.GET.get('category')
    companies_data = []

    if category_name:
        try:
            category = Furniture_Categorie.objects.get(furniture_name__iexact=category_name)
            companies = category.furniture_companies.all()
            for company in companies:
                related_companies = company.company_companies.all()  # Получаем связанные компании
                related_companies_data = []  # Список для хранения данных связанных компаний

                for related_company in related_companies:
                    related_companies_data.append({
                        'related_company_name': related_company.model_name,
                    })

                companies_data.append({
                    'company_name': company.company_name,
                    'logo_url': company.company_logo.url,
                    'related_companies': related_companies_data,  # Добавляем данные о связанных компаниях
                })
        except Furniture_Categorie.DoesNotExist:
            return JsonResponse({'error': 'Категория не найдена'}, status=404)

    return JsonResponse(companies_data, safe=False)  # Возвращаем данные в формате JSON

def get_classes(request):

    category_name = request.GET.get('category')
    company_name = request.GET.get('company')
    classes_name = request.GET.get('classes')
    #print(category_name)

    ## Parsing the classes_name JSON
    jsonClasses = json.loads(classes_name)

    #AllCompany = Company_Furniture.objects.all()
    #for model_company in AllCompany:
    #    print(model_company.company_companies)

    AllModels = Model_Class.objects.filter(
        class_category__furniture_name=category_name,  # Adjust the field name if needed
    )
    filtered_models = [model for model in AllModels if model.model_name in jsonClasses]

    # Convert the queryset to a list of dictionaries or some other format if needed
    models_data = [{
        'model_name': model.model_name,
        'model_logo': model.model_logo.url if model.model_logo else None,
        'category_name': category_name,
        'company_name': company_name,
    } for model in filtered_models]

    return JsonResponse(models_data, safe=False)  # возвращаем данные в формате JSON

def get_products(request):

    category_name = request.GET.get('category')
    company_name = request.GET.get('company')
    classes_name = request.GET.get('classes')

    print(Model_Class.objects.all())
    print(classes_name)

    category = Furniture_Categorie.objects.get(furniture_name__iexact=category_name)
    company = Company_Furniture.objects.get(company_name__iexact=company_name)
    #classes = Model_Class.objects.get(model_name__iexact=classes_name)
    #print(classes)

    products = Product_Item.objects.filter(
    product_categories=category,
    product_company=company,
    ).values(
        'unique_id', 'product_name', 'product_icon', 'product_url', 
        'product_price', 'product_material', 'product_height', 
        'product_width', 'product_depth', 'product_short_description', 
        'product_description', 'created_date', 'product_type', 'product_subtype', 'product_material_url',
        'product_3Durl', 'product_3Dname',
    )

    post_products = []
    for product in products:
        product_item = Product_Item.objects.get(unique_id=product['unique_id'])
        images = [img.image.url for img in product_item.images.all()]  # Получаем URL изображений
        product['product_images'] = images
        post_products.append(product)

    return JsonResponse(post_products, safe=False)

def add_to_cart(request):
    if request.method == 'POST':
        item_id = request.POST.get('item_id')
        # Здесь вы можете использовать сессию или другую логику для хранения корзины
        cart = request.session.get('cart', {})
        # Увеличиваем количество товара в корзине или добавляем новый
        if item_id in cart:
            cart[item_id]['quantity'] += 1
        else:
            item = Product_Item.objects.get(unique_id=item_id)
            if item.product_type == "material":
                cart[item_id] = {
                    'title': item.product_name,
                    'icon': item.product_icon.url,
                    'price': 0,  # Устанавливаем цену как "-"
                    'quantity': 0,  # Устанавливаем количество как "-"
                    'total': 0  # Общая сумма будет 0
                }
            else:
                cart[item_id] = {
                    'title': item.product_name,
                    'icon': item.product_icon.url,
                    'price': str(item.product_price),
                    'quantity': 1
                }
                
        request.session['cart'] = cart

        total_amount = 0  # Переменная для хранения общей суммы
        # Проходим по каждому элементу в корзине и вычисляем сумму
        for item_id, item_data in cart.items():
            item_price = float(item_data['price'])  # Преобразуем цену в float
            item_quantity = item_data['quantity']
            item_total = item_price * item_quantity  # Считаем итоговую сумму для данного товара
            item_data['total'] = item_total  # Добавляем итоговую сумму в данные элемента
            total_amount += item_total  # Добавляем к общей сумме

        product_item = Product_Item.objects.get(unique_id=item_id)

        product_item_data = {
            'item_id': product_item.unique_id,
            'item_type': product_item.product_type,
            'mesh_subtype': product_item.product_subtype,
            'model_url': str(product_item.product_3Durl),
            'model_name': str(product_item.product_3Dname),
            'width': product_item.product_width,
            'height': product_item.product_height,
            'depth': product_item.product_depth,
            'material_url': product_item.product_material_url.url if product_item.product_material_url else None,
        }

        context = {
            'cart': cart,
            'product': product_item_data,  # Добавляем общую сумму в контекст
        }

        return JsonResponse(context)

def remove_from_cart(request):
    if request.method == 'POST':
        item_id = request.POST.get('item_id')
        cart = request.session.get('cart', {})

        if item_id in cart:
            # Уменьшаем количество товара на 1
            cart[item_id]['quantity'] -= 1

            # Если quantity достиг 0, удаляем товар из корзины
            if cart[item_id]['quantity'] == 0:
                del cart[item_id]

            # Обновляем сессию
            request.session['cart'] = cart

        # Возвращаем актуализированное состояние корзины
        total_amount = 0
        for item_data in cart.values():
            item_price = float(item_data['price'])
            item_quantity = item_data['quantity']
            item_total = item_price * item_quantity
            item_data['total'] = item_total
            total_amount += item_total

        return JsonResponse({'cart': cart, 'total_amount': total_amount})

    return JsonResponse({'error': 'Invalid request'}, status=400)
    
def cart_view(request):
    cart = request.session.get('cart', {})
    total_amount = 0  # Переменная для хранения общей суммы

    # Проходим по каждому элементу в корзине и вычисляем сумму
    for item_id, item_data in cart.items():
        item_price = float(item_data['price'])  # Преобразуем цену в float
        item_quantity = item_data['quantity']
        item_total = item_price * item_quantity  # Считаем итоговую сумму для данного товара
        item_data['total'] = item_total  # Добавляем итоговую сумму в данные элемента
        total_amount += item_total  # Добавляем к общей сумме

    context = {
        'cart': cart,
        'total_amount': total_amount,  # Добавляем общую сумму в контекст
    }
    return render(request, 'cart.html', context)

def get_item_info(request):
    item_id = request.GET.get('item_id')
    item = Product_Item.objects.get(unique_id=item_id)
    product_images = [img.image.url for img in item.images.all()]  # Получаем URL изображений

    context = {
        'title': item.product_name,
        'images': product_images,
        'info': item.product_description,
        'price': str(item.product_price),
        'material': str(item.product_material),
        'height': str(item.product_height),
        'width': str(item.product_width),
        'depth': str(item.product_depth),
        'url': str(item.product_url),
        'company': str(item.product_company),
    }
    return JsonResponse(context)  # или любой другой атрибут

def get_cart_info(request):
    cart = request.session.get('cart', {})
    total_amount = 0  # Переменная для хранения общей суммы

    # Проходим по каждому элементу в корзине и вычисляем сумму
    for item_id, item_data in cart.items():
        item_price = float(item_data['price'])  # Преобразуем цену в float
        item_quantity = item_data['quantity']
        item_total = item_price * item_quantity  # Считаем итоговую сумму для данного товара
        item_data['total'] = item_total  # Добавляем итоговую сумму в данные элемента
        total_amount += item_total  # Добавляем к общей сумме


    context = {
        'cart': cart,
        'total_amount': total_amount,  # Добавляем общую сумму в контекст
    }
    return JsonResponse(context)  # или любой другой атрибут

def search_product(request):
    if 'term' in request.GET:
        query = request.GET.get('term')
        products = Product_Item.objects.filter(Q(product_searchTag__icontains=query))
        results = []
        for product in products:
            results.append({
                'id': product.unique_id,
                'name': product.product_name,
                'description': product.product_short_description,
                'price': product.product_price,
                'icon_url': product.product_icon.url if product.product_icon else None,
            })
        return JsonResponse(results, safe=False)
    return JsonResponse([], safe=False)

@csrf_exempt
def save_scene(request):
    if request.method == 'POST':
        # Получаем данные сцены в формате JSON из запроса
        scene_data = json.loads(request.body)
        
        if scene_data:
            # Сохраняем сериализованную сцену в сессию
            request.session['scene_data'] = scene_data
            return JsonResponse({'status': 'success'})
        
        return JsonResponse({'status': 'error', 'message': 'No scene data provided.'})

def my_json_view(request):
    return JsonResponse(request.session['scene_data'], safe=False)

